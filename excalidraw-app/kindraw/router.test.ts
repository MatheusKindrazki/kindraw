import {
  buildHybridPath,
  isKindrawPath,
  matchKindrawRoute,
  shouldAutoCreateRootDrawing,
} from "./router";

describe("Kindraw router", () => {
  it("should match workspace routes", () => {
    expect(matchKindrawRoute("/")).toEqual({
      kind: "workspace",
      folderId: null,
    });

    expect(matchKindrawRoute("/folder/folder-123")).toEqual({
      kind: "workspace",
      folderId: "folder-123",
    });
  });

  it("should match editor routes", () => {
    expect(matchKindrawRoute("/draw/item-1")).toEqual({
      kind: "drawing",
      itemId: "item-1",
    });

    expect(matchKindrawRoute("/doc/item-2")).toEqual({
      kind: "doc",
      itemId: "item-2",
    });

    expect(matchKindrawRoute("/hybrid/h-1?view=canvas&section=intro")).toEqual({
      kind: "hybrid",
      hybridId: "h-1",
      view: "canvas",
      sectionId: "intro",
    });
  });

  it("should match share routes and ignore public app paths", () => {
    expect(matchKindrawRoute("/share/public-token")).toEqual({
      kind: "share",
      token: "public-token",
      view: "both",
      sectionId: null,
    });

    expect(matchKindrawRoute("/")).toEqual({
      kind: "workspace",
      folderId: null,
    });

    expect(isKindrawPath("/doc/item-2")).toBe(true);
    expect(isKindrawPath("/hybrid/h-1?view=both")).toBe(true);
    expect(isKindrawPath("/legacy")).toBe(false);
  });

  it("should build hybrid routes", () => {
    expect(
      buildHybridPath("hybrid-1", {
        view: "document",
        sectionId: "overview",
      }),
    ).toBe("/hybrid/hybrid-1?view=document&section=overview");
  });

  it("should identify when root should auto-create a drawing", () => {
    expect(
      shouldAutoCreateRootDrawing("/", {
        kind: "workspace",
        folderId: null,
      }),
    ).toBe(true);

    expect(
      shouldAutoCreateRootDrawing("/folder/folder-123", {
        kind: "workspace",
        folderId: "folder-123",
      }),
    ).toBe(false);

    expect(
      shouldAutoCreateRootDrawing("/draw/item-1", {
        kind: "drawing",
        itemId: "item-1",
      }),
    ).toBe(false);
  });
});
