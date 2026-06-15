import { describe, expect, it } from "vitest";

import {
  appendHybridSection,
  buildKindrawSectionLink,
  composeSectionMarkdown,
  deleteHybridMarkdownSection,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
  replaceHybridMarkdownSection,
  splitSectionHeadingBody,
} from "./hybridSections";

const indexOfSection = (markdown: string, predicate: (title: string) => boolean) =>
  parseHybridMarkdownSections(markdown).findIndex((section) =>
    predicate(section.title),
  );

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

  it("replaces a section markdown by index while preserving order", () => {
    const markdown = "# First\n\nAlpha\n\n# Second\n\nBeta\n";
    // índice 1 = "Second" (índice 0 = "First")
    const nextMarkdown = replaceHybridMarkdownSection(
      markdown,
      1,
      "# Second\n\nUpdated\n",
    );

    expect(nextMarkdown).toContain("Updated");
    expect(nextMarkdown).toContain("# First");
    expect(nextMarkdown).not.toContain("Beta");
  });

  it("preserves a heading boundary when replacing the intro section (index 0)", () => {
    const markdown = "Intro\n\n# First\n\nAlpha\n";
    const nextMarkdown = replaceHybridMarkdownSection(
      markdown,
      0,
      "Intro atualizado",
    );

    expect(nextMarkdown).toContain("Intro atualizado\n\n# First");
  });

  it("updates a middle section without duplicating it (regression: section save bug)", () => {
    // 3 seções; editar a do meio mudando até o título não deve criar seção nova.
    const markdown =
      "# Alpha\n\nA\n\n# Beta\n\nB\n\n# Gamma\n\nG\n";
    const middleIndex = indexOfSection(markdown, (title) => title === "Beta");
    expect(middleIndex).toBe(1);

    const next = replaceHybridMarkdownSection(
      markdown,
      middleIndex,
      "# Beta renomeada\n\nConteúdo novo\n",
    );

    const titles = parseHybridMarkdownSections(next).map((s) => s.title);
    // continua com 3 seções, na ordem, com a do meio atualizada.
    expect(titles).toEqual(["Alpha", "Beta renomeada", "Gamma"]);
    expect(next).toContain("Conteúdo novo");
    expect(next).not.toContain("\nB\n");
  });

  it("updates a section whose title collides with another (slug-collision bug)", () => {
    // duas seções com o mesmo título → ids "nota" e "nota-2".
    // editar a SEGUNDA por índice deve atualizar só ela, não a primeira.
    const markdown = "# Nota\n\nPrimeira\n\n# Nota\n\nSegunda\n";
    const next = replaceHybridMarkdownSection(
      markdown,
      1,
      "# Nota\n\nSegunda editada\n",
    );

    expect(next).toContain("Primeira");
    expect(next).toContain("Segunda editada");
    expect(next).not.toContain("\nSegunda\n");
  });

  it("deletes a section by index, keeping the others", () => {
    const markdown = "# Alpha\n\nA\n\n# Beta\n\nB\n\n# Gamma\n\nG\n";
    const next = deleteHybridMarkdownSection(markdown, 1);

    const titles = parseHybridMarkdownSections(next).map((s) => s.title);
    expect(titles).toEqual(["Alpha", "Gamma"]);
    expect(next).not.toContain("Beta");
  });

  it("returns empty markdown when the last section is deleted", () => {
    const markdown = "# Only\n\nContent\n";
    const next = deleteHybridMarkdownSection(markdown, 0);
    expect(next).toBe("");
    // o parser recria uma intro vazia a partir de markdown vazio.
    const sections = parseHybridMarkdownSections(next);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.isIntro).toBe(true);
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
    // cenário do bug: criar seção, editar o conteúdo, salvar
    const initial = "# Nova nota visual\n\n";
    const { markdown: afterAppend } = appendHybridSection(
      initial,
      "Nova seção",
    );
    const newIndex = indexOfSection(
      afterAppend,
      (title) => title === "Nova seção",
    );
    // Edita o conteúdo preservando o nível do heading (# raiz) — assim a seção
    // permanece uma seção própria, não vira subseção da anterior.
    const next = replaceHybridMarkdownSection(
      afterAppend,
      newIndex,
      "# Nova seção\n\nCorpo novo\n",
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
