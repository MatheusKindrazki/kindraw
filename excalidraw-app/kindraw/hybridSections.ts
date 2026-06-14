import { marked } from "marked";

type MarkdownToken = {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
};

export type KindrawHybridSection = {
  id: string;
  title: string;
  depth: number;
  markdown: string;
  isIntro: boolean;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const buildSectionId = (
  title: string,
  counts: Map<string, number>,
  fallback = "section",
) => {
  const base = title ? slugify(title) : fallback;
  const nextCount = (counts.get(base) || 0) + 1;
  counts.set(base, nextCount);
  return nextCount === 1 ? base : `${base}-${nextCount}`;
};

const joinMarkdown = (tokens: MarkdownToken[]) =>
  tokens.map((token) => token.raw || "").join("");

const parseTokens = (markdown: string) =>
  marked.lexer(markdown, { gfm: true }) as MarkdownToken[];

export const parseHybridMarkdownSections = (
  markdown: string,
): KindrawHybridSection[] => {
  const tokens = parseTokens(markdown);
  if (!tokens.length) {
    return [
      {
        id: "intro",
        title: "Visao geral",
        depth: 0,
        markdown: "",
        isIntro: true,
      },
    ];
  }

  const counts = new Map<string, number>();
  const sections: KindrawHybridSection[] = [];
  const introTokens: MarkdownToken[] = [];
  let currentSection: {
    title: string;
    depth: number;
    tokens: MarkdownToken[];
  } | null = null;

  const flushCurrentSection = () => {
    if (!currentSection) {
      return;
    }

    sections.push({
      id: buildSectionId(currentSection.title, counts),
      title: currentSection.title,
      depth: currentSection.depth,
      markdown: joinMarkdown(currentSection.tokens),
      isIntro: false,
    });
    currentSection = null;
  };

  for (const token of tokens) {
    if (token.type === "heading") {
      if (!currentSection) {
        currentSection = {
          title: token.text || "Section",
          depth: token.depth || 1,
          tokens: [token],
        };
        continue;
      }

      if ((token.depth || 1) <= currentSection.depth) {
        flushCurrentSection();
        currentSection = {
          title: token.text || "Section",
          depth: token.depth || 1,
          tokens: [token],
        };
        continue;
      }

      currentSection.tokens.push(token);
      continue;
    }

    if (currentSection) {
      currentSection.tokens.push(token);
    } else {
      introTokens.push(token);
    }
  }

  if (introTokens.length) {
    sections.unshift({
      id: "intro",
      title: "Visao geral",
      depth: 0,
      markdown: joinMarkdown(introTokens),
      isIntro: true,
    });
  }

  flushCurrentSection();

  return sections.length
    ? sections
    : [
        {
          id: "intro",
          title: "Visao geral",
          depth: 0,
          markdown,
          isIntro: true,
        },
      ];
};

export const replaceHybridMarkdownSection = (
  markdown: string,
  sectionId: string,
  nextSectionMarkdown: string,
) => {
  const sections = parseHybridMarkdownSections(markdown);
  return sections
    .map((section) =>
      section.id === sectionId
        ? nextSectionMarkdown.trimEnd()
        : section.markdown.trimEnd(),
    )
    .join("\n\n")
    .trimEnd()
    .concat("\n");
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

export const buildKindrawSectionLink = (hybridId: string, sectionId: string) =>
  `kindraw://section/${hybridId}/${sectionId}`;

export const parseKindrawSectionLink = (href: string) => {
  if (!href.startsWith("kindraw://section/")) {
    return null;
  }

  const pathname = href.replace("kindraw://section/", "");
  const [hybridId, sectionId] = pathname.split("/");
  if (!hybridId || !sectionId) {
    return null;
  }

  return {
    hybridId,
    sectionId,
  };
};
