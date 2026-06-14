import { describe, expect, it } from "vitest";

import {
  appendHybridSection,
  buildKindrawSectionLink,
  composeSectionMarkdown,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
  replaceHybridMarkdownSection,
  splitSectionHeadingBody,
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

  it("appends a new root-level section and returns its parsed id", () => {
    const markdown = "## First\n\nAlpha\n";
    const { markdown: nextMarkdown, sectionId } = appendHybridSection(
      markdown,
      "Nova seção",
    );

    expect(nextMarkdown).toContain("Nova seção");
    expect(sectionId).toBe("nova-secao");

    const sections = parseHybridMarkdownSections(nextMarkdown);
    // A nova seção deve ser uma seção própria (raiz), não subseção da anterior.
    expect(sections.some((section) => section.id === sectionId)).toBe(true);
    expect(sections[sections.length - 1]?.title).toBe("Nova seção");
  });

  it("appends a unique id when the section title is duplicated", () => {
    const first = appendHybridSection("## First\n\nAlpha\n", "Nova seção");
    const second = appendHybridSection(first.markdown, "Nova seção");

    expect(first.sectionId).toBe("nova-secao");
    expect(second.sectionId).toBe("nova-secao-2");

    const sections = parseHybridMarkdownSections(second.markdown);
    expect(sections.map((section) => section.id)).toContain("nova-secao");
    expect(sections.map((section) => section.id)).toContain("nova-secao-2");
  });

  it("creates a section from empty markdown", () => {
    const { markdown: nextMarkdown, sectionId } = appendHybridSection(
      "",
      "Intro",
    );

    expect(nextMarkdown).toContain("Intro");
    expect(sectionId).toBe("intro");

    const sections = parseHybridMarkdownSections(nextMarkdown);
    expect(sections[sections.length - 1]?.title).toBe("Intro");
  });

  it("splits a section into heading and body", () => {
    expect(splitSectionHeadingBody("## Título\n\nCorpo aqui\n")).toEqual({
      heading: "## Título",
      body: "Corpo aqui",
    });
    // intro sem heading
    expect(splitSectionHeadingBody("Só corpo\n")).toEqual({
      heading: "",
      body: "Só corpo",
    });
  });

  it("recomposes a section preserving heading when body is edited", () => {
    const { heading } = splitSectionHeadingBody("## Nova seção\n");
    const next = composeSectionMarkdown(heading, "Conteúdo da segunda seção.");
    expect(next).toBe("## Nova seção\n\nConteúdo da segunda seção.\n");
  });

  it("round-trips append + edit body without losing the heading", () => {
    // cenário do bug: criar seção, editar só o corpo, salvar
    const initial = "# Nova nota visual\n\n";
    const { markdown: afterAppend, sectionId } = appendHybridSection(
      initial,
      "Nova seção",
    );
    const section = parseHybridMarkdownSections(afterAppend).find(
      (entry) => entry.id === sectionId,
    );
    const { heading } = splitSectionHeadingBody(section?.markdown || "");
    const next = replaceHybridMarkdownSection(
      afterAppend,
      sectionId,
      composeSectionMarkdown(heading, "Corpo novo"),
    );

    const sections = parseHybridMarkdownSections(next);
    expect(sections.map((s) => s.title)).toEqual([
      "Nova nota visual",
      "Nova seção",
    ]);
    expect(next).toContain("Nova seção");
    expect(next).toContain("Corpo novo");
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
