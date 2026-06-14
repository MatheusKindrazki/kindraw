import { useEffect, useMemo, useRef, useState } from "react";

import { KindrawIcon } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichTextEditor } from "./RichTextEditor";
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
  linkedSectionIds?: ReadonlySet<string>;
  onMarkdownChange: (nextMarkdown: string) => void;
  onNavigate: (pathname: string) => void;
  onOpenCanvas: (sectionId: string) => void;
  onLinkSelection: (sectionId: string) => void;
  onStatusMessage: (message: string) => void;
};

const formatSectionNumber = (value: number) => String(value).padStart(2, "0");

export const HybridMarkdownPane = ({
  hybridId,
  markdown,
  itemsById,
  activeSectionId,
  canLinkSelection,
  linkedSectionIds,
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

  let sectionNumber = 0;

  return (
    <div className="kindraw-hybrid-doc">
      {sections.map((section) => {
        const isEditing = editingSectionId === section.id;
        const isActive = activeSectionId === section.id;
        const isLinked = linkedSectionIds?.has(section.id) || false;
        if (!section.isIntro) {
          sectionNumber += 1;
        }

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
              <div className="kindraw-hybrid-doc__section-heading">
                <span className="kindraw-hybrid-doc__eyebrow">
                  {section.isIntro
                    ? "Intro"
                    : `Seção ${formatSectionNumber(sectionNumber)}`}
                </span>
                <h3>{section.title}</h3>
                {isLinked ? (
                  <span className="kindraw-sectionchip">
                    <KindrawIcon name="link" size={11} /> vinculada ao canvas
                  </span>
                ) : null}
              </div>
              <div className="kindraw-hybrid-doc__actions">
                <button
                  className="kindraw-hybrid-doc__action"
                  onClick={() => setEditingSectionId(section.id)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="kindraw-hybrid-doc__action"
                  onClick={() => void onOpenCanvas(section.id)}
                  type="button"
                >
                  Canvas
                </button>
                <button
                  className="kindraw-hybrid-doc__action"
                  disabled={!canLinkSelection}
                  onClick={() => void onLinkSelection(section.id)}
                  type="button"
                >
                  Vincular seleção
                </button>
                <button
                  className="kindraw-hybrid-doc__action"
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
                <RichTextEditor
                  onChange={setDraftMarkdown}
                  placeholder="Escreva o conteúdo da seção…"
                  value={draftMarkdown}
                />
                <div className="kindraw-hybrid-doc__editor-actions">
                  <button
                    className="kindraw-btn kindraw-btn--soft kindraw-btn--sm"
                    onClick={() => setEditingSectionId(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
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
                    Salvar seção
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
