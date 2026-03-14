import { describe, expect, it } from "vitest";

import { parseDrawingContent } from "./drawing";

describe("parseDrawingContent", () => {
  it("marca drawings carregados para abrir enquadrados", async () => {
    const initialData = await parseDrawingContent(
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "https://kindraw.dev",
        elements: [
          {
            id: "rect-1",
            type: "rectangle",
            x: 680,
            y: 393,
            width: 692,
            height: 406,
            angle: 0,
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            index: "a0",
            roundness: { type: 3 },
            seed: 1,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
            boundElements: [],
            updated: 1,
            link: null,
            locked: false,
          },
        ],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
        files: {},
      }),
    );

    expect(initialData?.fitToContent).toBe(true);
    expect(initialData?.elements).toHaveLength(1);
  });
});
