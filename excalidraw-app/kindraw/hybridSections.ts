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
