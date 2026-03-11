import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownPreview } from "./MarkdownPreview";
import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
  replaceHybridMarkdownSection,
} from "./hybridSections";

import type { KindrawItem } from "./types";

type HybridMarkdownPaneProps = {
  hybridId: string;
  markdown: string;
  itemsById: Record<string, KindrawItem>;
  activeSectionId: string | null;
  canLinkSelection: boolean;
  onMarkdownChange: (nextMarkdown: string) => void;
  onNavigate: (pathname: string) => void;
  onOpenCanvas: (sectionId: string) => void;
  onLinkSelection: (sectionId: string) => void;
  onStatusMessage: (message: string) => void;
};

export const HybridMarkdownPane = ({
  hybridId,
  markdown,
  itemsById,
  activeSectionId,
  canLinkSelection,
  onMarkdownChange,
  onNavigate,
  onOpenCanvas,
  onLinkSelection,
  onStatusMessage,
}: HybridMarkdownPaneProps) => {
  const sections = useMemo(
    () => parseHybridMarkdownSections(markdown),
    [markdown],
  );
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!activeSectionId) {
      return;
    }

    const nextTarget = sectionRefs.current[activeSectionId];
    if (nextTarget) {
      nextTarget.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [activeSectionId]);

  useEffect(() => {
    if (!editingSectionId) {
      setDraftMarkdown("");
      return;
    }

    const section = sections.find((entry) => entry.id === editingSectionId);
    setDraftMarkdown(section?.markdown || "");
  }, [editingSectionId, sections]);

  return (
    <div className="kindraw-hybrid-doc">
      {sections.map((section) => {
        const isEditing = editingSectionId === section.id;
        const isActive = activeSectionId === section.id;

        return (
          <article
            className={`kindraw-hybrid-doc__section${
              isActive ? " kindraw-hybrid-doc__section--active" : ""
            }`}
            data-section-id={section.id}
            key={section.id}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
          >
            <div className="kindraw-hybrid-doc__section-header">
              <div>
                <span className="kindraw-eyebrow">
                  {section.isIntro ? "Intro" : `Secao ${section.id}`}
                </span>
                <h3>{section.title}</h3>
              </div>
              <div className="kindraw-inline-actions">
                <button
                  className="kindraw-link-button"
                  onClick={() => setEditingSectionId(section.id)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="kindraw-link-button"
                  onClick={() => void onOpenCanvas(section.id)}
                  type="button"
                >
                  Canvas
                </button>
                <button
                  className="kindraw-link-button"
                  disabled={!canLinkSelection}
                  onClick={() => void onLinkSelection(section.id)}
                  type="button"
                >
                  Vincular selecao
                </button>
                <button
                  className="kindraw-link-button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(buildKindrawSectionLink(hybridId, section.id))
                      .then(() =>
                        onStatusMessage(
                          "Link da secao copiado para a area de transferencia.",
                        ),
                      )
                      .catch((error) =>
                        onStatusMessage(
                          error instanceof Error
                            ? error.message
                            : "Falha ao copiar o link da secao.",
                        ),
                      );
                  }}
                  type="button"
                >
                  Copiar link
                </button>
              </div>
            </div>

            {isEditing ? (
              <div className="kindraw-hybrid-doc__editor">
                <textarea
                  className="kindraw-hybrid-doc__textarea"
                  onChange={(event) => setDraftMarkdown(event.target.value)}
                  value={draftMarkdown}
                />
                <div className="kindraw-inline-actions">
                  <button
                    className="kindraw-button kindraw-button--secondary"
                    onClick={() => setEditingSectionId(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="kindraw-button"
                    onClick={() => {
                      onMarkdownChange(
                        replaceHybridMarkdownSection(
                          markdown,
                          section.id,
                          draftMarkdown,
                        ),
                      );
                      setEditingSectionId(null);
                      onStatusMessage("Secao atualizada.");
                    }}
                    type="button"
                  >
                    Salvar secao
                  </button>
                </div>
              </div>
            ) : (
              <MarkdownPreview
                itemsById={itemsById}
                markdown={section.markdown}
                onNavigate={onNavigate}
              />
            )}
          </article>
        );
      })}
    </div>
  );
};
