import { describe, expect, it } from "vitest";

import { composeIconImages } from "./icons";

describe("composeIconImages", () => {
  const fakeFetch = async (id: string, _color?: string) => {
    if (id === "bad:icon") {
      const e = new Error("404") as Error & { status?: number };
      e.status = 404;
      throw e;
    }
    return `<svg id="${id}"/>`;
  };

  it("produces an image skeleton + matching files entry per icon (deterministic fileId)", async () => {
    const { imageSkeletons, files, warnings } = await composeIconImages(
      [{ iconId: "mdi:home", nodeId: "a", color: "#ff0000" }],
      fakeFetch,
      { positions: { a: { x: 10, y: 20 } } },
    );
    expect(warnings).toEqual([]);
    expect(imageSkeletons).toHaveLength(1);
    const img = imageSkeletons[0];
    expect(img.type).toBe("image");
    expect(img.status).toBe("saved");
    expect(img.x).toBe(10);
    expect(img.y).toBe(20);
    // fileId is referenced and present in files (no dangling fileId).
    expect(files[img.fileId as string]).toBeDefined();
    const entry = files[img.fileId as string] as { dataURL: string };
    expect(entry.dataURL.startsWith("data:image/svg+xml;base64,")).toBe(true);
    // base64 decodes back to the original svg.
    const b64 = entry.dataURL.replace("data:image/svg+xml;base64,", "");
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe(
      '<svg id="mdi:home"/>',
    );
  });

  it("is deterministic: same icon+color -> same fileId", async () => {
    const a = await composeIconImages(
      [{ iconId: "mdi:home", color: "#fff" }],
      fakeFetch,
    );
    const b = await composeIconImages(
      [{ iconId: "mdi:home", color: "#fff" }],
      fakeFetch,
    );
    expect(a.imageSkeletons[0].fileId).toBe(b.imageSkeletons[0].fileId);
  });

  it("different color -> different fileId (color is part of the hash)", async () => {
    const a = await composeIconImages(
      [{ iconId: "mdi:home", color: "#fff" }],
      fakeFetch,
    );
    const b = await composeIconImages(
      [{ iconId: "mdi:home", color: "#000" }],
      fakeFetch,
    );
    expect(a.imageSkeletons[0].fileId).not.toBe(b.imageSkeletons[0].fileId);
  });

  it("skips a 404 icon with a warning instead of aborting (no dangling fileId)", async () => {
    const { imageSkeletons, files, warnings } = await composeIconImages(
      [{ iconId: "mdi:home" }, { iconId: "bad:icon" }],
      fakeFetch,
    );
    expect(imageSkeletons).toHaveLength(1);
    expect(warnings).toEqual(["bad:icon"]);
    // Atomicity: every emitted image has a matching files entry; the skipped
    // icon left NO orphan file.
    expect(Object.keys(files)).toHaveLength(1);
    expect(files[imageSkeletons[0].fileId as string]).toBeDefined();
  });

  it("lays out node-less icons on a grid (no positions map)", async () => {
    const { imageSkeletons } = await composeIconImages(
      [{ iconId: "mdi:a" }, { iconId: "mdi:b" }],
      fakeFetch,
    );
    expect(imageSkeletons).toHaveLength(2);
    // Two grid cells, distinct positions.
    const p0 = `${imageSkeletons[0].x},${imageSkeletons[0].y}`;
    const p1 = `${imageSkeletons[1].x},${imageSkeletons[1].y}`;
    expect(p0).not.toBe(p1);
  });

  // FIX 1 (BizLogic MEDIUM-1) — grid-placed icons must clear the diagram. When
  // the caller passes originY = the scene's bottom edge, EVERY grid-placed icon
  // sits at y >= originY (no overlap with content occupying y up to originY).
  it("starts the grid at originY so grid icons clear the scene content", async () => {
    const N = 240; // a scene whose elements occupy y up to N
    // 10 node-less icons -> spread over >1 grid row, so we exercise the row math.
    const placements = Array.from({ length: 10 }, (_, i) => ({
      iconId: `mdi:i${i}`,
    }));
    const { imageSkeletons } = await composeIconImages(placements, fakeFetch, {
      originY: N,
    });
    expect(imageSkeletons).toHaveLength(10);
    for (const img of imageSkeletons) {
      expect(img.y as number).toBeGreaterThanOrEqual(N);
    }
  });

  it("node-placed icons ignore originY (they use the node position)", async () => {
    const { imageSkeletons } = await composeIconImages(
      [{ iconId: "mdi:home", nodeId: "a" }],
      fakeFetch,
      { positions: { a: { x: 5, y: 7 } }, originY: 999 },
    );
    expect(imageSkeletons[0].x).toBe(5);
    expect(imageSkeletons[0].y).toBe(7);
  });

  // FIX 3 (Security MEDIUM) — cap icon count at the library layer so an
  // unbounded list can't amplify into N serial remote fetches.
  it("throws when given more than the max number of placements (101)", async () => {
    const placements = Array.from({ length: 101 }, (_, i) => ({
      iconId: `mdi:i${i}`,
    }));
    let fetchCalls = 0;
    const countingFetch = async (id: string, color?: string) => {
      fetchCalls += 1;
      return fakeFetch(id, color);
    };
    await expect(
      composeIconImages(placements, countingFetch),
    ).rejects.toThrow(/too many icons/i);
    // Cap fires BEFORE any fetch — zero amplification.
    expect(fetchCalls).toBe(0);
  });

  it("accepts exactly the max number of placements (100)", async () => {
    const placements = Array.from({ length: 100 }, (_, i) => ({
      iconId: `mdi:i${i}`,
    }));
    const { imageSkeletons } = await composeIconImages(placements, fakeFetch);
    expect(imageSkeletons).toHaveLength(100);
  });
});
