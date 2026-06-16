// SHARED hybrid section parser — the SINGLE source of truth for section-link
// slugs. Imported by BOTH the Kindraw app (excalidraw-app/kindraw/hybridSections.ts
// re-exports from here) AND the @kindraw/client orchestrator (composeHybrid).
//
// Why shared, not vendored: the hybrid section-link slugs (kindraw://section/...)
// are written into the canvas by the client and resolved against the doc by the
// app. If the two slug implementations ever drift, canvas->doc links silently
// break. A re-export from one module makes drift structurally impossible.
//
// Depends on `marked` (the markdown lexer). Do NOT regex-port this logic: the
// dedup counter (base / base-2 / base-3), depth-nesting (deeper headings fold
// into the parent section), and NFD accent stripping are load-bearing.
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

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

export const buildSectionId = (
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
