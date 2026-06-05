// Bootstraps a minimal DOM in Node so mermaid + Excalidraw's element transform
// can run server-side. Proven viable by spike: jsdom provides document/window,
// node-canvas provides measureText, and we shim getBBox/getBoundingClientRect
// (which jsdom does NOT implement — the layout the spike flagged as the risk).
//
// Must be called once, before importing mermaid / convertToExcalidrawElements.

let booted = false;

export const ensureDom = async (): Promise<void> => {
  if (booted) {
    return;
  }
  booted = true;

  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    // A concrete URL gives a non-opaque origin so localStorage etc. don't throw.
    url: "http://localhost/",
  });
  const { window } = dom;

  const setGlobal = (key: string, value: unknown) => {
    try {
      (globalThis as Record<string, unknown>)[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    }
  };

  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("navigator", window.navigator);

  // mermaid 11 reaches for many DOM/CSSOM globals (CSSStyleSheet, DOMParser,
  // Element, XMLSerializer, MutationObserver, …). Mirror every browser global
  // the jsdom window exposes onto globalThis, rather than hand-listing them.
  const win = window as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis) {
      continue;
    }
    let value: unknown;
    try {
      value = win[key]; // some props (e.g. localStorage) throw on access
    } catch {
      continue;
    }
    if (typeof value === "function" || (value && typeof value === "object")) {
      setGlobal(key, value);
    }
  }

  setGlobal(
    "getComputedStyle",
    window.getComputedStyle?.bind(window) ||
      (() => ({ getPropertyValue: () => "", stroke: "", fill: "" })),
  );

  // jsdom does not compute SVG layout: shim getBBox / getBoundingClientRect.
  const shimBBox = function (this: { textContent?: string }) {
    const text = this.textContent || "";
    return { x: 0, y: 0, width: Math.max(10, text.length * 8), height: 20 };
  };
  const SVGProto = window.SVGElement?.prototype as
    | { getBBox?: unknown }
    | undefined;
  if (SVGProto && !SVGProto.getBBox) {
    SVGProto.getBBox = shimBBox;
  }
  (window.Element.prototype as { getBoundingClientRect: unknown })
    .getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON() {},
    };
  };

  // Route document.createElement('canvas') to node-canvas for text measurement.
  const canvasMod = await import("canvas");
  const createCanvas = (canvasMod as { createCanvas: (w: number, h: number) => unknown })
    .createCanvas;
  const origCreate = window.document.createElement.bind(window.document);
  (window.document as { createElement: unknown }).createElement = (
    tag: string,
    ...rest: unknown[]
  ) => {
    if (String(tag).toLowerCase() === "canvas") {
      return createCanvas(200, 50);
    }
    return (origCreate as (t: string, ...r: unknown[]) => unknown)(tag, ...rest);
  };
};
