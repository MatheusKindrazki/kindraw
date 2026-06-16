// Hybrid section helpers for the Kindraw app.
//
// The slug + parser primitives (slugify, buildSectionId, parseHybridMarkdownSections,
// buildKindrawSectionLink, parseKindrawSectionLink) now live in ONE shared module
// inside @kindraw/client so the app and the MCP/CLI client can NEVER drift on the
// kindraw://section/<id>/<slug> format. We re-export them here so every existing
// importer (HybridMarkdownPane, HybridEditorPage, MarkdownPreview, etc.) keeps its
// public API unchanged. The app-specific section-editing helpers (replace/delete/
// append/split/compose) stay below and consume the shared parser.
import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
  slugify,
  type KindrawHybridSection,
} from "@kindraw/client/sections";

export type { KindrawHybridSection };
export {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
};

/**
 * Substitui o markdown da seção na posição `sectionIndex` e devolve o markdown
 * recomposto, preservando as demais seções na ordem.
 *
 * A identificação é POSICIONAL (índice na lista parseada), não por `id` de slug.
 * O `id` é derivado do título e é recalculado a cada parse — se o título mudar
 * (ou houver colisão de slug), o `id` antigo deixa de existir e o match falhava,
 * fazendo a edição virar uma seção nova (bug). O índice é estável durante a
 * edição da seção, então o update sempre acerta a seção certa.
 */
export const replaceHybridMarkdownSection = (
  markdown: string,
  sectionIndex: number,
  nextSectionMarkdown: string,
) => {
  const sections = parseHybridMarkdownSections(markdown);
  return sections
    .map((section, index) =>
      index === sectionIndex
        ? nextSectionMarkdown.trimEnd()
        : section.markdown.trimEnd(),
    )
    .join("\n\n")
    .trimEnd()
    .concat("\n");
};

/**
 * Remove a seção na posição `sectionIndex` e devolve o markdown recomposto.
 * Se sobrar nenhuma seção, devolve string vazia (o parser recria uma intro).
 */
export const deleteHybridMarkdownSection = (
  markdown: string,
  sectionIndex: number,
) => {
  const sections = parseHybridMarkdownSections(markdown);
  const remaining = sections
    .filter((_, index) => index !== sectionIndex)
    .map((section) => section.markdown.trimEnd())
    .filter((entry) => entry.length > 0);

  if (!remaining.length) {
    return "";
  }

  return remaining.join("\n\n").trimEnd().concat("\n");
};

/**
 * Separa o markdown de uma seção em { heading, body }.
 * `heading` é a primeira linha de título (ex.: "## Título") — vazio na intro;
 * `body` é o resto. Permite editar só o corpo no WYSIWYG sem mexer no heading
 * (que mistura título e corpo e era perdido pelo editor rico).
 */
export const splitSectionHeadingBody = (
  sectionMarkdown: string,
): { heading: string; body: string } => {
  const match = sectionMarkdown.match(/^(\s*#{1,6}\s+[^\n]*)\n?([\s\S]*)$/);
  if (!match) {
    return { heading: "", body: sectionMarkdown.trim() };
  }
  return { heading: match[1].trim(), body: (match[2] || "").trim() };
};

/**
 * Recompõe o markdown de uma seção a partir do heading preservado + corpo novo.
 */
export const composeSectionMarkdown = (heading: string, body: string) => {
  const trimmedBody = body.trim();
  if (!heading) {
    return trimmedBody ? `${trimmedBody}\n` : "";
  }
  return trimmedBody ? `${heading}\n\n${trimmedBody}\n` : `${heading}\n`;
};

/**
 * Anexa uma nova seção (heading depth 2) ao fim do markdown e devolve o markdown
 * resultante junto com o id da seção criada.
 *
 * O id de uma seção depende de duplicatas de título (sufixos -2, -3...). Por isso,
 * em vez de prever o id por slug, anexamos o heading, re-parseamos com
 * parseHybridMarkdownSections e pegamos o id da ÚLTIMA seção cujo título bate —
 * garantindo que o id retornado é exatamente o que o parser vai usar.
 */
export const appendHybridSection = (
  markdown: string,
  title: string,
): { markdown: string; sectionId: string } => {
  const safeTitle = title.trim() || "Nova seção";
  const base = markdown.trimEnd();

  // O heading novo precisa virar uma seção de nível raiz (não uma subseção do
  // último heading). O parser trata um heading com depth maior que o da seção
  // corrente como subseção, então usamos o MENOR depth de topo já existente
  // (limitado a 2 por padrão) para garantir que a nova seção fica no mesmo nível.
  const existingSections = base
    ? parseHybridMarkdownSections(base).filter((section) => !section.isIntro)
    : [];
  const topDepth = existingSections.reduce(
    (min, section) => Math.min(min, section.depth || 2),
    2,
  );
  const depth = Math.max(1, topDepth);
  const heading = `${"#".repeat(depth)} ${safeTitle}`;
  const appended = base ? `${base}\n\n${heading}\n\n` : `${heading}\n\n`;

  const sections = parseHybridMarkdownSections(appended);
  const created = [...sections]
    .reverse()
    .find((section) => !section.isIntro && section.title === safeTitle);

  return {
    markdown: appended,
    sectionId: created?.id || slugify(safeTitle),
  };
};
