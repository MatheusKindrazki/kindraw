import { useEffect, useMemo, useRef, useState } from "react";

import { KindrawIcon } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichTextEditor } from "./RichTextEditor";
import {
  buildKindrawSectionLink,
  deleteHybridMarkdownSection,
  parseHybridMarkdownSections,
  replaceHybridMarkdownSection,
} from "./hybridSections";

import type { KindrawItem } from "./types";
import type { KindrawYjsProvider } from "./yjsProvider";

type HybridMarkdownPaneProps = {
  hybridId: string;
  markdown: string;
  itemsById: Record<string, KindrawItem>;
  activeSectionId: string | null;
  canLinkSelection: boolean;
  linkedSectionIds?: ReadonlySet<string>;
  linkingSectionId?: string | null;
  // Quando há uma sessão ao vivo, o painel troca o modo seção por um único
  // editor colaborativo full-document (Yjs).
  collabProvider?: KindrawYjsProvider | null;
  // identidade do usuário local p/ o caret nomeado (CollaborationCaret) +
  // facepile (avatar/login/id).
  collabUser?: {
    name: string;
    color: string;
    avatarUrl?: string | null;
    githubLogin?: string | null;
    userId?: string | null;
  } | null;
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
  collabProvider,
  collabUser,
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
  // Identificação POSICIONAL: a seção em edição é a do índice — estável durante
  // a edição mesmo que o conteúdo (e portanto o id derivado do slug) mude.
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null,
  );
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [deletingSectionIndex, setDeletingSectionIndex] = useState<
    number | null
  >(null);
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
    if (editingSectionIndex === null) {
      setDraftMarkdown("");
      return;
    }

    // Edita a seção INTEIRA (heading incluso, se houver) como um bloco de
    // conteúdo livre no WYSIWYG — sem campo de título separado.
    const section = sections[editingSectionIndex];
    setDraftMarkdown(section?.markdown || "");
  }, [editingSectionIndex, sections]);

  // Esc cancela a confirmação de exclusão.
  useEffect(() => {
    if (deletingSectionIndex === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeletingSectionIndex(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deletingSectionIndex]);

  const handleAddSection = () => {
    const newSectionId = onAddSection();
    if (newSectionId) {
      // A nova seção é sempre a última da lista após o append.
      setEditingSectionIndex(sections.length);
    }
  };

  const handleSaveSection = (sectionIndex: number) => {
    onMarkdownChange(
      replaceHybridMarkdownSection(markdown, sectionIndex, draftMarkdown),
    );
    setEditingSectionIndex(null);
    onStatusMessage("Secao atualizada.");
  };

  let sectionNumber = 0;

  // Modo colaborativo ao vivo: um único editor full-document governado por Yjs,
  // com presença/cursores. O markdown serializado continua sendo salvo por baixo
  // (onMarkdownChange) para manter D1/preview público consistentes. A presença
  // (quem está aqui) é comunicada pelo facepile no header — sem banner ruidoso.
  if (collabProvider) {
    return (
      <div className="kindraw-hybrid-doc kindraw-hybrid-doc--live">
        <div className="kindraw-hybrid-doc__editor kindraw-hybrid-doc__editor--live">
          <RichTextEditor
            collab={{
              provider: collabProvider,
              fieldName: "default",
              user: collabUser || {
                name: "Você",
                color: "#888",
                avatarUrl: null,
                githubLogin: null,
                userId: null,
              },
            }}
            onChange={onMarkdownChange}
            placeholder="Escreva em conjunto…"
            seedMarkdown={markdown}
            value={markdown}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="kindraw-hybrid-doc">
      {sections.map((section, sectionIndex) => {
        const isEditing = editingSectionIndex === sectionIndex;
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
                  onClick={() => setEditingSectionIndex(sectionIndex)}
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
                {section.isIntro ? null : (
                  <button
                    aria-label="Excluir seção"
                    className="kindraw-hybrid-doc__action kindraw-hybrid-doc__action--danger"
                    onClick={() => setDeletingSectionIndex(sectionIndex)}
                    title="Excluir seção"
                    type="button"
                  >
                    Excluir
                  </button>
                )}
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
                    onClick={() => setEditingSectionIndex(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
                    onClick={() => handleSaveSection(sectionIndex)}
                    type="button"
                  >
                    Salvar seção
                  </button>
                </div>
              </div>
            ) : (
              // Duplo-clique no corpo/preview abre edição. Fica só no corpo —
              // não no cabeçalho clicável da seção vinculada (que é onClick
              // simples e leva ao desenho), então não há conflito.
              <div
                className="kindraw-hybrid-doc__preview"
                onDoubleClick={() => setEditingSectionIndex(sectionIndex)}
                title="Clique duas vezes para editar"
              >
                <MarkdownPreview
                  itemsById={itemsById}
                  markdown={section.markdown}
                  onNavigate={onNavigate}
                />
              </div>
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

      {deletingSectionIndex !== null ? (
        <div
          className="kindraw-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDeletingSectionIndex(null);
            }
          }}
        >
          <div aria-modal="true" className="kindraw-modal" role="dialog">
            <h2>Excluir seção</h2>
            <p>
              Excluir esta seção do documento? O conteúdo dela será removido.
              Essa ação não pode ser desfeita.
            </p>
            <div className="kindraw-modal__actions">
              <button
                className="kindraw-btn kindraw-btn--soft"
                onClick={() => setDeletingSectionIndex(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="kindraw-btn kindraw-btn--danger"
                onClick={() => {
                  const index = deletingSectionIndex;
                  setDeletingSectionIndex(null);
                  if (editingSectionIndex === index) {
                    setEditingSectionIndex(null);
                  }
                  onMarkdownChange(deleteHybridMarkdownSection(markdown, index));
                  onStatusMessage("Secao excluida.");
                }}
                type="button"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
