import { describe, expect, it } from "vitest";

import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
  replaceHybridMarkdownSection,
} from "./hybridSections";

describe("hybridSections", () => {
  it("splits markdown into intro and heading sections", () => {
    const sections = parseHybridMarkdownSections(
      "Preamble\n\n# First\n\nAlpha\n\n## Nested\n\nBeta\n\n# Second\n\nGamma\n",
    );

    expect(sections.map((section) => section.id)).toEqual([
      "intro",
      "first",
      "second",
    ]);
    expect(sections[1]?.markdown).toContain("## Nested");
  });

  it("replaces a section markdown while preserving order", () => {
    const markdown = "# First\n\nAlpha\n\n# Second\n\nBeta\n";
    const nextMarkdown = replaceHybridMarkdownSection(
      markdown,
      "second",
      "# Second\n\nUpdated\n",
    );

    expect(nextMarkdown).toContain("Updated");
    expect(nextMarkdown).toContain("# First");
  });

  it("preserves a heading boundary when replacing the intro section", () => {
    const markdown = "Intro\n\n# First\n\nAlpha\n";
    const nextMarkdown = replaceHybridMarkdownSection(
      markdown,
      "intro",
      "Intro atualizado",
    );

    expect(nextMarkdown).toContain("Intro atualizado\n\n# First");
  });

  it("builds and parses kindraw section links", () => {
    const link = buildKindrawSectionLink("hybrid-1", "overview");

    expect(link).toBe("kindraw://section/hybrid-1/overview");
    expect(parseKindrawSectionLink(link)).toEqual({
      hybridId: "hybrid-1",
      sectionId: "overview",
    });
  });
});
