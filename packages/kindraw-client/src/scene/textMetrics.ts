// DOM-free text measurement for the scene builder.
//
// `convertToExcalidrawElements` from @excalidraw/element measures label text to
// size containers. By default it does `document.createElement("canvas")`, which
// is not available in plain Node. We provide a TextMetricsProvider that uses the
// `canvas` npm package (real font metrics) when it loads, and a deterministic
// per-character fallback otherwise. Register it via setCustomTextMetricsProvider
// BEFORE the first convertToExcalidrawElements call (see build.ts).

import { createRequire } from "node:module";

import type { TextMetricsProvider } from "@excalidraw/element";

// `require` is not defined in ESM. createRequire gives us a synchronous require
// so the provider can satisfy the synchronous getLineWidth contract.
const require = createRequire(import.meta.url);

// Lazily-created node-canvas 2d context, shared across measurements.
let nodeCanvasCtx:
  | { measureText: (t: string) => { width: number }; font: string }
  | null
  | undefined;

const getNodeCanvasCtx = () => {
  if (nodeCanvasCtx !== undefined) {
    return nodeCanvasCtx;
  }
  try {
    // `canvas` is a dependency of this package. require() keeps this synchronous
    // so the provider can satisfy the synchronous getLineWidth contract.
    const { createCanvas } = require("canvas") as {
      createCanvas: (w: number, h: number) => {
        getContext: (t: "2d") => {
          measureText: (t: string) => { width: number };
          font: string;
        };
      };
    };
    nodeCanvasCtx = createCanvas(10, 10).getContext("2d");
  } catch {
    nodeCanvasCtx = null; // canvas unavailable → use fallback
  }
  return nodeCanvasCtx;
};

// Average glyph width as a fraction of font size, for the fallback path. Tuned
// to roughly match a sans/handwritten font so layout spacing stays sane.
const AVG_CHAR_RATIO = 0.55;

const parseFontSize = (fontString: string): number => {
  // fontString looks like "20px Virgil, Segoe UI Emoji". Anchored + bounded so
  // a hostile string can't make the regex engine do superlinear work and so we
  // only ever read a leading, sanely-sized px value. (Security M1.)
  const match = /^\s*(\d{1,4}(?:\.\d{1,3})?)px/.exec(fontString);
  return match ? parseFloat(match[1]) : 16;
};

export class NodeTextMetricsProvider implements TextMetricsProvider {
  getLineWidth(text: string, fontString: string): number {
    const ctx = getNodeCanvasCtx();
    if (ctx) {
      ctx.font = fontString;
      const w = ctx.measureText(text).width;
      if (w > 0) {
        return w;
      }
    }
    // Fallback: deterministic, font-size-aware per-character estimate.
    const fontSize = parseFontSize(fontString);
    return Math.max(1, text.length) * fontSize * AVG_CHAR_RATIO;
  }
}

// Padding around a label inside its container (matches Excalidraw's feel).
const LABEL_PADDING_X = 30;
const LABEL_PADDING_Y = 20;
const MIN_NODE_WIDTH = 60;
const MIN_NODE_HEIGHT = 40;
const LINE_HEIGHT_RATIO = 1.25;

// Sticky-note defaults, mirroring the editor's createStickyNoteOnPointerDown
// (STICKY_NOTE_BACKGROUND in App.tsx) so a generated sticky is indistinguishable
// from a hand-placed one. Floored to a note-like minimum so a short label still
// reads as a piece of paper rather than a tiny box.
export const STICKY_NOTE_BACKGROUND = "#ffec99";
const STICKY_MIN_SIZE = 120;

const sharedProvider = new NodeTextMetricsProvider();

/**
 * Measure the box needed to contain `label` at `fontSize`, including padding and
 * enforcing minimums. Multi-line labels (\n) are supported. DOM-free.
 */
export const measureLabel = (
  label: string,
  fontSize: number,
): { width: number; height: number } => {
  const fontString = `${fontSize}px Virgil, Segoe UI Emoji`;
  const lines = (label.length ? label : " ").split("\n");
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(
      maxWidth,
      sharedProvider.getLineWidth(line || " ", fontString),
    );
  }
  const width = Math.max(MIN_NODE_WIDTH, Math.ceil(maxWidth) + LABEL_PADDING_X);
  const height = Math.max(
    MIN_NODE_HEIGHT,
    Math.ceil(lines.length * fontSize * LINE_HEIGHT_RATIO) + LABEL_PADDING_Y,
  );
  return { width, height };
};

/**
 * Measure a sticky note: a label box floored to a note-like minimum square so a
 * short note still reads as paper. Auto-grows for long text. DOM-free.
 */
export const measureSticky = (
  label: string,
  fontSize: number,
): { width: number; height: number } => {
  const { width, height } = measureLabel(label, fontSize);
  return {
    width: Math.max(STICKY_MIN_SIZE, width),
    height: Math.max(STICKY_MIN_SIZE, height),
  };
};
