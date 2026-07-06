import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";

import { convertToExcalidrawElements } from "@excalidraw/element";
import { exportToCanvas } from "@excalidraw/utils";

import { buildHybridPath } from "./router";
import { parseKindrawSectionLink } from "./hybridSections";

import type { KindrawItem } from "./types";

type MarkdownToken = {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
  lang?: string;
  href?: string;
  title?: string | null;
  ordered?: boolean;
  items?: MarkdownToken[];
  tokens?: MarkdownToken[];
  rows?: MarkdownToken[][];
  header?: MarkdownToken[];
  checked?: boolean;
  task?: boolean;
};

type MarkdownPreviewProps = {
  markdown: string;
  itemsById?: Record<string, KindrawItem>;
  onNavigate?: (pathname: string) => void;
  emptyMessage?: string;
  resolveInternalHref?: (
    href: string,
    resolvedHref: string | null,
  ) => string | null;
};

export const parseMarkdownBlocks = (markdown: string) =>
  marked.lexer(markdown, { gfm: true }) as MarkdownToken[];

const isExternalProtocol = (value: string) =>
  /^(https?:|mailto:|tel:)/i.test(value);

export const resolveKindrawHref = (
  href: string,
  itemsById?: Record<string, KindrawItem>,
) => {
  const sectionTarget = parseKindrawSectionLink(href);
  if (sectionTarget) {
    return buildHybridPath(sectionTarget.hybridId, {
      view: "both",
      sectionId: sectionTarget.sectionId,
    });
  }

  if (
    href === "/" ||
    href.startsWith("/draw/") ||
    href.startsWith("/doc/") ||
    href.startsWith("/hybrid/") ||
    href.startsWith("/folder/")
  ) {
    return href;
  }

  if (href.startsWith("kindraw://item/")) {
    const itemId = href.replace("kindraw://item/", "");
    const item = itemsById?.[itemId];
    if (!item) {
      return null;
    }
    return item.kind === "drawing" ? `/draw/${item.id}` : `/doc/${item.id}`;
  }

  if (href.startsWith("kindraw://folder/")) {
    const folderId = href.replace("kindraw://folder/", "");
    return folderId ? `/folder/${folderId}` : "/";
  }

  return null;
};

const sanitizeHref = (href: string) => {
  if (!href.trim()) {
    return "#";
  }

  if (href.startsWith("/")) {
    return href;
  }

  if (isExternalProtocol(href)) {
    return href;
  }

  return "#";
};

const InlineLink = ({
  href,
  title,
  itemsById,
  onNavigate,
  resolveInternalHref,
  children,
}: {
  href: string;
  title?: string | null;
  itemsById?: Record<string, KindrawItem>;
  onNavigate?: (pathname: string) => void;
  resolveInternalHref?: (
    href: string,
    resolvedHref: string | null,
  ) => string | null;
  children: React.ReactNode;
}) => {
  const resolvedKindrawHref = resolveKindrawHref(href, itemsById);
  const internalHref = resolveInternalHref
    ? resolveInternalHref(href, resolvedKindrawHref)
    : resolvedKindrawHref;

  if (internalHref && onNavigate) {
    return (
      <a
        href={internalHref}
        title={title || undefined}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(internalHref);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={sanitizeHref(href)}
      title={title || undefined}
      rel={isExternalProtocol(href) ? "noreferrer" : undefined}
      target={isExternalProtocol(href) ? "_blank" : undefined}
    >
      {children}
    </a>
  );
};

// IDs únicos e estáveis para o mermaid.render (evita Math.random).
let mermaidRenderSeq = 0;

// Fallback para diagramas que o mermaid-to-excalidraw NÃO converte em elementos
// nativos (stateDiagram, gantt, pie, erDiagram, journey, mindmap…): renderiza o
// SVG do próprio mermaid inline. Diferente do caminho excalidraw (que rasteriza
// pra <canvas> e QUEBRA quando o SVG usa <foreignObject> de labels HTML), o SVG
// inline no DOM renderiza qualquer tipo. `<br/>` vira espaço porque com
// htmlLabels desligado (securityLevel strict) o mermaid não interpreta HTML.
const renderMermaidInlineSvg = async (
  container: HTMLElement,
  definition: string,
) => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    suppressErrorRendering: true,
  });
  mermaidRenderSeq += 1;
  const normalized = definition.replace(/<br\s*\/?>/gi, " ");
  const { svg } = await mermaid.render(
    `kindraw-mermaid-${mermaidRenderSeq}`,
    normalized,
  );
  container.innerHTML = svg;
  const svgEl = container.querySelector("svg");
  if (svgEl) {
    svgEl.removeAttribute("height");
    svgEl.style.maxWidth = "100%";
    svgEl.style.height = "auto";
  }
};

const MermaidBlock = ({ definition }: { definition: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const currentContainer = containerRef.current;

    const renderPreview = async () => {
      const container = currentContainer;
      if (!container) {
        return;
      }

      container.replaceChildren();
      setError(null);

      try {
        const { parseMermaidToExcalidraw } = await import(
          "@excalidraw/mermaid-to-excalidraw"
        );

        let parsed;
        try {
          parsed = await parseMermaidToExcalidraw(definition);
        } catch (error) {
          if (!definition.includes('"')) {
            throw error;
          }
          parsed = await parseMermaidToExcalidraw(
            definition.replace(/"/g, "'"),
          );
        }

        // Tipos não suportados pelo mermaid-to-excalidraw (stateDiagram, gantt,
        // pie, erDiagram…) voltam como um elemento de IMAGEM (SVG rasterizado),
        // que quebra ao virar <canvas> quando usa <foreignObject>. Nesses casos
        // renderizamos o SVG do mermaid inline, que suporta qualquer tipo.
        const isGraphImage = parsed.elements.some(
          (element) => (element as { type?: string }).type === "image",
        );
        if (isGraphImage) {
          await renderMermaidInlineSvg(container, definition);
          return;
        }

        const canvas = await exportToCanvas({
          elements: convertToExcalidrawElements(parsed.elements, {
            regenerateIds: true,
          }),
          files: parsed.files,
          exportPadding: 24,
          maxWidthOrHeight:
            Math.max(container.clientWidth || 0, 960) * window.devicePixelRatio,
          appState: {
            exportWithDarkMode: false,
          },
        });

        if (cancelled) {
          return;
        }

        container.replaceChildren(canvas);
      } catch (error) {
        if (cancelled) {
          return;
        }

        // Última tentativa: SVG inline do mermaid (cobre parse-ok mas
        // rasterização ruim, e parte dos erros do caminho excalidraw).
        try {
          await renderMermaidInlineSvg(container, definition);
          if (!cancelled) {
            setError(null);
          }
          return;
        } catch {
          // cai para a mensagem de erro abaixo
        }

        setError(
          error instanceof Error
            ? error.message
            : "Nao foi possivel renderizar o Mermaid.",
        );
      }
    };

    void renderPreview();

    return () => {
      cancelled = true;
      currentContainer?.replaceChildren();
    };
  }, [definition]);

  return (
    <div className="kindraw-markdown__mermaid">
      <div ref={containerRef} className="kindraw-markdown__mermaid-canvas" />
      {error && <pre className="kindraw-markdown__mermaid-error">{error}</pre>}
    </div>
  );
};

const renderInlineTokens = (
  tokens: MarkdownToken[] | undefined,
  itemsById?: Record<string, KindrawItem>,
  onNavigate?: (pathname: string) => void,
  resolveInternalHref?: (
    href: string,
    resolvedHref: string | null,
  ) => string | null,
  keyPrefix = "inline",
): React.ReactNode => {
  if (!tokens?.length) {
    return null;
  }

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (token.type) {
      case "text":
        if (token.tokens?.length) {
          return (
            <span key={key}>
              {renderInlineTokens(
                token.tokens,
                itemsById,
                onNavigate,
                resolveInternalHref,
                key,
              )}
            </span>
          );
        }
        return <span key={key}>{token.text || token.raw}</span>;
      case "strong":
        return (
          <strong key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </strong>
        );
      case "em":
        return (
          <em key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </em>
        );
      case "codespan":
        return <code key={key}>{token.text || ""}</code>;
      case "link":
        return (
          <InlineLink
            key={key}
            href={token.href || "#"}
            title={token.title}
            itemsById={itemsById}
            onNavigate={onNavigate}
            resolveInternalHref={resolveInternalHref}
          >
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            ) ||
              token.text ||
              token.href}
          </InlineLink>
        );
      case "br":
        return <br key={key} />;
      case "del":
        return (
          <del key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </del>
        );
      default:
        return <span key={key}>{token.raw || token.text || ""}</span>;
    }
  });
};

const renderBlockTokens = (
  tokens: MarkdownToken[],
  itemsById?: Record<string, KindrawItem>,
  onNavigate?: (pathname: string) => void,
  resolveInternalHref?: (
    href: string,
    resolvedHref: string | null,
  ) => string | null,
  keyPrefix = "block",
) =>
  tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (token.type) {
      case "space":
        return null;
      case "heading": {
        const depth = Math.min(Math.max(token.depth || 1, 1), 6);
        const HeadingTag = (["h1", "h2", "h3", "h4", "h5", "h6"] as const)[
          depth - 1
        ];
        return (
          <HeadingTag key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </HeadingTag>
        );
      }
      case "paragraph":
        return (
          <p key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </p>
        );
      case "text":
        return token.tokens?.length ? (
          <p key={key}>
            {renderInlineTokens(
              token.tokens,
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </p>
        ) : (
          <p key={key}>{token.text || token.raw || ""}</p>
        );
      case "blockquote":
        return (
          <blockquote key={key}>
            {renderBlockTokens(
              token.tokens || [],
              itemsById,
              onNavigate,
              resolveInternalHref,
              key,
            )}
          </blockquote>
        );
      case "list": {
        const ListTag = token.ordered ? "ol" : "ul";
        return (
          <ListTag key={key}>
            {(token.items || []).map((item, itemIndex) => (
              <li
                className={item.task ? "kindraw-markdown__task" : undefined}
                key={`${key}-item-${itemIndex}`}
              >
                {item.task ? (
                  <input
                    checked={item.checked}
                    disabled
                    readOnly
                    type="checkbox"
                  />
                ) : null}
                {renderBlockTokens(
                  item.tokens || [],
                  itemsById,
                  onNavigate,
                  resolveInternalHref,
                  `${key}-item-${itemIndex}`,
                )}
              </li>
            ))}
          </ListTag>
        );
      }
      case "code":
        return token.lang?.toLowerCase() === "mermaid" ? (
          <MermaidBlock key={key} definition={token.text || ""} />
        ) : (
          <pre key={key}>
            <code>{token.text || ""}</code>
          </pre>
        );
      case "hr":
        return <hr key={key} />;
      case "table":
        return (
          <div key={key} className="kindraw-markdown__table-wrap">
            <table>
              <thead>
                <tr>
                  {(token.header || []).map((headerCell, cellIndex) => (
                    <th key={`${key}-head-${cellIndex}`}>
                      {renderInlineTokens(
                        headerCell.tokens || [],
                        itemsById,
                        onNavigate,
                        resolveInternalHref,
                        `${key}-head-${cellIndex}`,
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(token.rows || []).map((row, rowIndex) => (
                  <tr key={`${key}-row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${key}-row-${rowIndex}-cell-${cellIndex}`}>
                        {renderInlineTokens(
                          cell.tokens || [],
                          itemsById,
                          onNavigate,
                          resolveInternalHref,
                          `${key}-row-${rowIndex}-cell-${cellIndex}`,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "html":
        return null;
      default:
        return token.raw ? <p key={key}>{token.raw}</p> : null;
    }
  });

export const MarkdownPreview = ({
  markdown,
  itemsById,
  onNavigate,
  emptyMessage,
  resolveInternalHref,
}: MarkdownPreviewProps) => {
  const tokens = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

  if (!markdown.trim()) {
    return (
      <div className="kindraw-markdown-preview kindraw-markdown-preview--empty">
        {emptyMessage || "Sem conteudo ainda."}
      </div>
    );
  }

  return (
    <div className="kindraw-markdown-preview">
      {renderBlockTokens(tokens, itemsById, onNavigate, resolveInternalHref)}
    </div>
  );
};
