import { useEffect, useMemo, useRef, useState } from "react";

import { KindrawIcon } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichTextEditor } from "./RichTextEditor";
import {
  buildKindrawSectionLink,
  composeSectionMarkdown,
  parseHybridMarkdownSections,
  replaceHybridMarkdownSection,
  splitSectionHeadingBody,
} from "./hybridSections";

import type { KindrawItem } from "./types";

type HybridMarkdownPaneProps = {
  hybridId: string;
  markdown: string;
  itemsById: Record<string, KindrawItem>;
  activeSectionId: string | null;
  canLinkSelection: boolean;
  linkedSectionIds?: ReadonlySet<string>;
  linkingSectionId?: string | null;
  onMarkdownChange: (nextMarkdown: string) => void;
  onNavigate: (pathname: string) => void;
  onOpenCanvas: (sectionId: string) => void;
  onLinkSelection: (sectionId: string) => void;
  onAddSection: () => string | null;
  onFocusSectionOnCanvas: (sectionId: string) => void;
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
  linkingSectionId,
  onMarkdownChange,
  onNavigate,
  onOpenCanvas,
  onLinkSelection,
  onAddSection,
  onFocusSectionOnCanvas,
  onStatusMessage,
}: HybridMarkdownPaneProps) => {
  const sections = useMemo(
    () => parseHybridMarkdownSections(markdown),
    [markdown],
  );
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
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

    // edita só o CORPO da seção; o título vai num input separado, para o
    // WYSIWYG não mesclar/perder o heading da seção.
    const section = sections.find((entry) => entry.id === editingSectionId);
    setDraftMarkdown(splitSectionHeadingBody(section?.markdown || "").body);
    setDraftTitle(section?.isIntro ? "" : section?.title || "");
  }, [editingSectionId, sections]);

  const handleAddSection = () => {
    const newSectionId = onAddSection();
    if (newSectionId) {
      setEditingSectionId(newSectionId);
    }
  };

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
              {isLinked ? (
                <div
                  className="kindraw-hybrid-doc__section-heading kindraw-hybrid-doc__section-heading--linked"
                  onClick={() => onFocusSectionOnCanvas(section.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onFocusSectionOnCanvas(section.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Ir ao desenho desta seção"
                >
                  <span className="kindraw-hybrid-doc__eyebrow">
                    {section.isIntro
                      ? "Intro"
                      : `Seção ${formatSectionNumber(sectionNumber)}`}
                  </span>
                  <h3>{section.title}</h3>
                  <span className="kindraw-sectionchip">
                    <KindrawIcon name="link" size={11} /> ir ao desenho
                  </span>
                </div>
              ) : (
                <div className="kindraw-hybrid-doc__section-heading">
                  <span className="kindraw-hybrid-doc__eyebrow">
                    {section.isIntro
                      ? "Intro"
                      : `Seção ${formatSectionNumber(sectionNumber)}`}
                  </span>
                  <h3>{section.title}</h3>
                </div>
              )}
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
                  className={`kindraw-hybrid-doc__action${
                    linkingSectionId === section.id
                      ? " kindraw-hybrid-doc__action--linking"
                      : ""
                  }`}
                  disabled={!canLinkSelection}
                  onClick={() => void onLinkSelection(section.id)}
                  type="button"
                >
                  {linkingSectionId === section.id
                    ? "Aguardando seleção…"
                    : "Vincular"}
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
                {section.isIntro ? null : (
                  <input
                    className="kindraw-hybrid-doc__title-input"
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Título da seção"
                    value={draftTitle}
                  />
                )}
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
                      // recompõe o heading (com o título editado, preservando o
                      // nível de #) + corpo editado. Intro não tem heading.
                      const originalHeading = splitSectionHeadingBody(
                        section.markdown,
                      ).heading;
                      let heading = originalHeading;
                      if (!section.isIntro) {
                        const hashes =
                          originalHeading.match(/^#{1,6}/)?.[0] ||
                          "#".repeat(Math.max(1, section.depth || 2));
                        const nextTitle =
                          draftTitle.trim() || section.title || "Seção";
                        heading = `${hashes} ${nextTitle}`;
                      }
                      onMarkdownChange(
                        replaceHybridMarkdownSection(
                          markdown,
                          section.id,
                          composeSectionMarkdown(heading, draftMarkdown),
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
      <button
        className="kindraw-hybrid-doc__add"
        onClick={handleAddSection}
        type="button"
      >
        <KindrawIcon name="plus" size={14} /> Nova seção
      </button>
    </div>
  );
};
