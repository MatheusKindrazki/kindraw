import { describe, expect, it, vi } from "vitest";

import { buildScene } from "./build";
import { syncScene, type SceneSyncClient } from "./sync";

const SPEC = {
  nodes: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  edges: [{ from: "a", to: "b" }],
};

// A fake client recording updateContent calls, with a configurable stored item.
const fakeClient = (item: {
  kind: string;
  content: string;
}): SceneSyncClient & { writes: Array<{ itemId: string; content: string }> } => {
  const writes: Array<{ itemId: string; content: string }> = [];
  return {
    writes,
    getItem: vi.fn(async () => ({
      item: { kind: item.kind },
      content: item.content,
    })),
    updateContent: vi.fn(async (itemId: string, content: string) => {
      writes.push({ itemId, content });
    }),
  };
};

describe("syncScene", () => {
  it("regenerates and writes when the live canvas differs from the spec", async () => {
    const client = fakeClient({ kind: "drawing", content: "stale-content" });
    const res = await syncScene(client, { itemId: "d1", spec: SPEC });
    expect(res.unchanged).toBe(false);
    expect(res.wrote).toBe(true);
    expect(client.writes.length).toBe(1);
    expect(client.writes[0]).toEqual({ itemId: "d1", content: res.content });
    expect(res.elementCount).toBeGreaterThan(0);
  });

  it("is idempotent: a byte-matching canvas is a no-op", async () => {
    const built = await buildScene(SPEC);
    const client = fakeClient({ kind: "drawing", content: built.content });
    const res = await syncScene(client, { itemId: "d1", spec: SPEC });
    expect(res.unchanged).toBe(true);
    expect(res.wrote).toBe(false);
    expect(client.updateContent).not.toHaveBeenCalled();
  });

  it("check mode never writes, even on drift", async () => {
    const client = fakeClient({ kind: "drawing", content: "stale-content" });
    const res = await syncScene(client, { itemId: "d1", spec: SPEC, check: true });
    expect(res.unchanged).toBe(false); // drift detected
    expect(res.wrote).toBe(false);
    expect(client.updateContent).not.toHaveBeenCalled();
  });

  it("refuses to clobber a doc (kind guard)", async () => {
    const client = fakeClient({ kind: "doc", content: "# notes" });
    await expect(
      syncScene(client, { itemId: "doc1", spec: SPEC }),
    ).rejects.toThrow(/drawing/i);
    expect(client.updateContent).not.toHaveBeenCalled();
  });

  it("rejects an invalid spec before any write", async () => {
    const client = fakeClient({ kind: "drawing", content: "stale" });
    await expect(
      syncScene(client, {
        itemId: "d1",
        spec: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow(/at least one node/i);
    expect(client.updateContent).not.toHaveBeenCalled();
  });

  it("propagates a getItem failure (e.g. 404)", async () => {
    const client: SceneSyncClient = {
      getItem: vi.fn(async () => {
        throw new Error("404 not found");
      }),
      updateContent: vi.fn(),
    };
    await expect(
      syncScene(client, { itemId: "ghost", spec: SPEC }),
    ).rejects.toThrow(/404/);
    expect(client.updateContent).not.toHaveBeenCalled();
  });
});
