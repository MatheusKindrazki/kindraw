import { describe, expect, it } from "vitest";

import { buildScene } from "./build";
import { extractDiagramSpec, type RawSceneElement } from "./extract";
import { validateDiagramSpec } from "./spec";

// Parse a built scene's serialized elements into the raw shape extract consumes.
const elementsOf = (content: string): RawSceneElement[] =>
  JSON.parse(content).elements;

describe("extractDiagramSpec", () => {
  it("returns null when there are no node shapes", () => {
    expect(extractDiagramSpec([])).toBeNull();
    expect(
      extractDiagramSpec([
        { id: "i", type: "image" },
        { id: "l", type: "line" },
      ]),
    ).toBeNull();
  });

  it("round-trips a node/edge graph through build → extract → validate → build", async () => {
    const spec = {
      nodes: [
        { id: "client", label: "Client", shape: "rectangle" as const },
        { id: "api", label: "API", shape: "rectangle" as const },
        { id: "db", label: "Database", shape: "ellipse" as const },
      ],
      edges: [
        { from: "client", to: "api", label: "HTTP" },
        { from: "api", to: "db", style: "dashed" as const },
      ],
    };
    const built = await buildScene(spec);
    const extracted = extractDiagramSpec(elementsOf(built.content));
    expect(extracted).not.toBeNull();
    const { spec: out, warnings } = extracted!;

    // Structure preserved.
    expect(out.nodes.map((n) => n.label).sort()).toEqual([
      "API",
      "Client",
      "Database",
    ]);
    expect(out.nodes.find((n) => n.label === "Database")?.shape).toBe("ellipse");
    expect(out.edges.length).toBe(2);
    expect(out.edges.some((e) => e.label === "HTTP")).toBe(true);
    expect(out.edges.some((e) => e.style === "dashed")).toBe(true);
    expect(warnings).toEqual([]);

    // The extracted spec is itself valid and rebuildable (the loop closes).
    expect(() => validateDiagramSpec(out)).not.toThrow();
    const rebuilt = await buildScene(out);
    expect(JSON.parse(rebuilt.content).elements.length).toBe(
      JSON.parse(built.content).elements.length,
    );
  });

  it("does not emit default colors for an uncolored node", async () => {
    const built = await buildScene({
      nodes: [{ id: "a", label: "A" }],
      edges: [],
    });
    const { spec } = extractDiagramSpec(elementsOf(built.content))!;
    expect(spec.nodes[0].strokeColor).toBeUndefined();
    expect(spec.nodes[0].backgroundColor).toBeUndefined();
  });

  it("preserves explicit node colors and a section link", async () => {
    const built = await buildScene({
      nodes: [
        {
          id: "a",
          label: "A",
          strokeColor: "#1971c2",
          backgroundColor: "#a5d8ff",
          link: "kindraw://section/h1/overview",
        },
      ],
      edges: [],
    });
    const { spec } = extractDiagramSpec(elementsOf(built.content))!;
    expect(spec.nodes[0].strokeColor).toBe("#1971c2");
    expect(spec.nodes[0].backgroundColor).toBe("#a5d8ff");
    expect(spec.nodes[0].link).toBe("kindraw://section/h1/overview");
  });

  it("round-trips a sticky to shape:sticky without its implied default colors", async () => {
    const built = await buildScene({
      nodes: [{ id: "s", label: "Note", shape: "sticky" }],
      edges: [],
    });
    const { spec } = extractDiagramSpec(elementsOf(built.content))!;
    expect(spec.nodes[0].shape).toBe("sticky");
    // sticky stroke/bg are implied by the shape — not re-serialized.
    expect(spec.nodes[0].strokeColor).toBeUndefined();
    expect(spec.nodes[0].backgroundColor).toBeUndefined();
  });

  it("round-trips groups (frames) with member assignment", async () => {
    const built = await buildScene({
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
        { id: "c", label: "C" },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g1", label: "Boundary" }],
    });
    const { spec } = extractDiagramSpec(elementsOf(built.content))!;
    expect(spec.groups?.length).toBe(1);
    expect(spec.groups?.[0].label).toBe("Boundary");
    const gid = spec.groups![0].id;
    const grouped = spec.nodes.filter((n) => n.group === gid).map((n) => n.label);
    expect(grouped.sort()).toEqual(["A", "B"]);
    // ungrouped node carries no group ref.
    expect(spec.nodes.find((n) => n.label === "C")?.group).toBeUndefined();
    expect(() => validateDiagramSpec(spec)).not.toThrow();
  });

  it("drops a free-floating arrow with a warning", () => {
    const els: RawSceneElement[] = [
      { id: "a", type: "rectangle" },
      { id: "b", type: "rectangle" },
      // arrow bound to only one node → free arrow
      {
        id: "ar",
        type: "arrow",
        startBinding: { elementId: "a" },
        endBinding: null,
      },
    ];
    const { spec, warnings } = extractDiagramSpec(els)!;
    expect(spec.edges.length).toBe(0);
    expect(warnings.some((w) => w.code === "free-arrow")).toBe(true);
  });

  it("counts omitted non-spec elements", () => {
    const els: RawSceneElement[] = [
      { id: "a", type: "rectangle" },
      { id: "img", type: "image" },
      { id: "fd", type: "freedraw" },
    ];
    const { warnings } = extractDiagramSpec(els)!;
    const omitted = warnings.find((w) => w.code === "omitted-elements");
    expect(omitted?.count).toBe(2);
  });

  it("is deterministic: same scene → identical spec", async () => {
    const built = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    const els = elementsOf(built.content);
    expect(JSON.stringify(extractDiagramSpec(els))).toBe(
      JSON.stringify(extractDiagramSpec(els)),
    );
  });
});
