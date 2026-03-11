import { beforeEach, describe, expect, it } from "vitest";

import { createKindrawItemPageMeta, syncKindrawPageMeta } from "./pageMeta";

const DEFAULT_META_TITLE =
  "Kindraw | Free multi-drawing workspace with realtime collaboration";
const DEFAULT_DESCRIPTION =
  "Kindraw is a free drawing workspace built for managing many diagrams, sharing public links, and collaborating in realtime.";
const DEFAULT_OG_TITLE = "Kindraw — Draw, organize, and collaborate";

const resetDocumentHead = () => {
  document.documentElement.removeAttribute("data-kindraw-default-title");
  document.head.innerHTML = `
    <title>Kindraw</title>
    <meta name="title" content="${DEFAULT_META_TITLE}" />
    <meta name="description" content="${DEFAULT_DESCRIPTION}" />
    <meta property="og:title" content="${DEFAULT_OG_TITLE}" />
    <meta property="og:description" content="${DEFAULT_DESCRIPTION}" />
    <meta property="og:url" content="https://kindraw.dev" />
    <meta property="twitter:title" content="${DEFAULT_OG_TITLE}" />
    <meta property="twitter:description" content="${DEFAULT_DESCRIPTION}" />
    <meta property="twitter:url" content="https://kindraw.dev" />
    <link rel="canonical" href="https://kindraw.dev" />
  `;
  document.title = "Kindraw";
};

describe("Kindraw page meta", () => {
  beforeEach(() => {
    resetDocumentHead();
  });

  it("syncs the current item title into the window and social metadata", () => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: "Realtime board",
        kind: "drawing",
        url: "https://kindraw.dev/draw/item-1#live",
      }),
    );

    expect(document.title).toBe("Realtime board · Kindraw");
    expect(
      document.querySelector('meta[name="title"]')?.getAttribute("content"),
    ).toBe("Realtime board · Kindraw");
    expect(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    ).toBe("Realtime board · Kindraw");
    expect(
      document
        .querySelector('meta[property="twitter:title"]')
        ?.getAttribute("content"),
    ).toBe("Realtime board · Kindraw");
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(
      "Open Realtime board in Kindraw for drawing and realtime collaboration.",
    );
    expect(
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content"),
    ).toBe("https://kindraw.dev/draw/item-1");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://kindraw.dev/draw/item-1");
  });

  it("restores the default metadata when no item title is active", () => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: "Product spec",
        kind: "doc",
        surface: "share",
        url: "https://kindraw.dev/share/spec-1",
      }),
    );

    syncKindrawPageMeta({
      url: "https://kindraw.dev/",
    });

    expect(document.title).toBe("Kindraw");
    expect(
      document.querySelector('meta[name="title"]')?.getAttribute("content"),
    ).toBe(DEFAULT_META_TITLE);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(DEFAULT_DESCRIPTION);
    expect(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    ).toBe(DEFAULT_OG_TITLE);
    expect(
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content"),
    ).toBe("https://kindraw.dev/");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://kindraw.dev/");
  });
});
