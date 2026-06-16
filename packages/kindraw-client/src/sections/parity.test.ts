import { describe, expect, it } from "vitest";

// PARITY GUARD (#1 risk): the SHARED parser here is the SAME module the app
// re-exports (excalidraw-app/kindraw/hybridSections.ts imports it). These
// fixtures mirror the app's own hybridSections.test.ts. If any id below drifts,
// canvas->doc links break in production. The expected ids are taken from the
// APP's assertions — never "fix" them to match a broken parser; fix the parser.
import { buildKindrawSectionLink, parseHybridMarkdownSections } from "./index";

describe("hybridSections parity (shared module == app fixtures)", () => {
  it("intro + heading split yields stable ids (nested folds into 'first')", () => {
    // Exact fixture from excalidraw-app/kindraw/hybridSections.test.ts.
    const sections = parseHybridMarkdownSections(
      "Preamble\n\n# First\n\nAlpha\n\n## Nested\n\nBeta\n\n# Second\n\nGamma\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["intro", "first", "second"]);
    // The deeper "## Nested" heading folds into the "first" section, not its own.
    expect(sections[1]?.markdown).toContain("## Nested");
  });

  it("deduplicates colliding titles (nota / nota-2)", () => {
    // Mirrors the app's slug-collision regression fixture.
    const sections = parseHybridMarkdownSections(
      "# Nota\n\nPrimeira\n\n# Nota\n\nSegunda\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["nota", "nota-2"]);
  });

  it("triple collision dedups to base / base-2 / base-3", () => {
    const sections = parseHybridMarkdownSections(
      "# Nota\n\nA\n\n# Nota\n\nB\n\n# Nota\n\nC\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["nota", "nota-2", "nota-3"]);
  });

  it("strips accents in slugs (Configuração -> configuracao)", () => {
    const sections = parseHybridMarkdownSections(
      "# Configuração\n\nx\n\n# Visão Geral\n\ny\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["configuracao", "visao-geral"]);
  });

  it("falls back to 'section' for a title with no slug chars", () => {
    const sections = parseHybridMarkdownSections("# ---\n\nbody\n");
    expect(sections[0]?.id).toBe("section");
  });

  it("returns a single empty intro for empty markdown", () => {
    const sections = parseHybridMarkdownSections("");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.isIntro).toBe(true);
    expect(sections[0]?.id).toBe("intro");
  });

  it("nested depth: every deeper heading folds into the nearest shallower one", () => {
    const sections = parseHybridMarkdownSections(
      "# A\n\n## A1\n\n### A1a\n\n# B\n\n## B1\n",
    );
    // Only the root (#) headings start new sections; the rest fold in.
    expect(sections.map((s) => s.id)).toEqual(["a", "b"]);
    expect(sections[0]?.markdown).toContain("## A1");
    expect(sections[0]?.markdown).toContain("### A1a");
  });

  it("builds the canonical kindraw:// section link", () => {
    expect(buildKindrawSectionLink("h1", "configuracao")).toBe(
      "kindraw://section/h1/configuracao",
    );
  });
});
