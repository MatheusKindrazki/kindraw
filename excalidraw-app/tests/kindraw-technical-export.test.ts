import { describe, expect, it } from "vitest";

import {
  buildDrawIoMermaidUrl,
  exportSceneToMermaid,
  getTechnicalExportBaseName,
} from "../kindraw/technicalExport";

describe("Kindraw technical export", () => {
  it("exports a simple bound flowchart to Mermaid", () => {
    const mermaid = exportSceneToMermaid([
      {
        id: "start",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 120,
        height: 60,
      },
      {
        id: "start-text",
        type: "text",
        containerId: "start",
        text: "Start",
        x: 16,
        y: 18,
        width: 60,
        height: 24,
      },
      {
        id: "decision",
        type: "diamond",
        x: 280,
        y: 0,
        width: 120,
        height: 80,
      },
      {
        id: "decision-text",
        type: "text",
        containerId: "decision",
        text: "Ready?",
        x: 300,
        y: 28,
        width: 70,
        height: 24,
      },
      {
        id: "edge",
        type: "arrow",
        x: 120,
        y: 40,
        width: 160,
        height: 0,
        points: [
          [0, 0],
          [160, 0],
        ],
        startBinding: { elementId: "start" },
        endBinding: { elementId: "decision" },
      },
      {
        id: "edge-text",
        type: "text",
        containerId: "edge",
        text: "next",
        x: 180,
        y: 16,
        width: 40,
        height: 20,
      },
    ] as any);

    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain('N0["Start"]');
    expect(mermaid).toContain('N1{"Ready?"}');
    expect(mermaid).toContain('N0 -->|"next"| N1');
  });

  it("builds a draw.io create URL from Mermaid text", () => {
    const url = buildDrawIoMermaidUrl("flowchart TD\nA-->B", "Roadmap");

    expect(url).toContain("https://app.diagrams.net/?create=");
    expect(decodeURIComponent(url)).toContain('"type":"mermaid"');
    expect(url).toContain("roadmap.drawio");
  });

  it("sanitizes file names for technical export artifacts", () => {
    expect(getTechnicalExportBaseName("  API Sync Board  ")).toBe(
      "api-sync-board",
    );
    expect(getTechnicalExportBaseName("")).toBe("kindraw-diagram");
  });
});
