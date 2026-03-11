import { describe, expect, it } from "vitest";

import {
  buildFolderPath,
  buildHybridPath,
  buildItemPath,
  matchKindrawRoute,
  shouldAutoCreateRootDrawing,
} from "../kindraw/router";

describe("Kindraw router", () => {
  it("matches workspace routes", () => {
    expect(matchKindrawRoute("/")).toEqual({
      kind: "workspace",
      folderId: null,
    });
    expect(matchKindrawRoute("/folder/f-1")).toEqual({
      kind: "workspace",
      folderId: "f-1",
    });
  });

  it("matches editor routes", () => {
    expect(matchKindrawRoute("/draw/item-1")).toEqual({
      kind: "drawing",
      itemId: "item-1",
    });
    expect(matchKindrawRoute("/doc/item-2")).toEqual({
      kind: "doc",
      itemId: "item-2",
    });
    expect(matchKindrawRoute("/hybrid/hybrid-1?view=both")).toEqual({
      kind: "hybrid",
      hybridId: "hybrid-1",
      view: "both",
      sectionId: null,
    });
  });

  it("matches public share routes", () => {
    expect(matchKindrawRoute("/share/token-1")).toEqual({
      kind: "share",
      token: "token-1",
      view: "both",
      sectionId: null,
    });
  });

  it("builds internal paths", () => {
    expect(buildFolderPath(null)).toBe("/");
    expect(buildFolderPath("folder-1")).toBe("/folder/folder-1");
    expect(
      buildItemPath({
        id: "doc-1",
        kind: "doc",
      }),
    ).toBe("/doc/doc-1");
    expect(buildHybridPath("hybrid-1", { view: "canvas" })).toBe(
      "/hybrid/hybrid-1?view=canvas",
    );
  });

  it("flags root workspace for auto-creation", () => {
    expect(
      shouldAutoCreateRootDrawing("/", {
        kind: "workspace",
        folderId: null,
      }),
    ).toBe(true);
    expect(
      shouldAutoCreateRootDrawing("/folder/f-1", {
        kind: "workspace",
        folderId: "f-1",
      }),
    ).toBe(false);
  });
});
