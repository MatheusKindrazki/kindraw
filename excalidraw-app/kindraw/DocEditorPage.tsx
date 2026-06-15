import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";

import {
  createShareLink,
  getItem,
  revokeShareLink,
  updateItemContent,
  updateItemMeta,
} from "./api";
import { KindrawIcon } from "./icons";
import { RichTextEditor } from "./RichTextEditor";
import { buildFolderPath, buildHybridPath, navigateKindraw } from "./router";
import { ShareLinksPanel } from "./ShareLinksPanel";
import { getKindrawDraft, setKindrawDraft } from "./storage";
import { getErrorMessage, isDraftNewer } from "./utils";

import type { KindrawFolder, KindrawItem, KindrawItemResponse } from "./types";

type DocEditorPageProps = {
  itemId: string;
  onTreeRefresh: () => Promise<void> | void;
  folders?: KindrawFolder[];
};

export const DocEditorPage = ({
  itemId,
  onTreeRefresh,
  folders,
}: DocEditorPageProps) => {
  const [itemResponse, setItemResponse] = useState<KindrawItemResponse | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [statusMessage, setStatusMessage] = useState("Carregando documento...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [lastSavedContent, setLastSavedContent] = useState("");

  const loadItem = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage("Carregando documento...");

    try {
      const response = await getItem(itemId);
      const draft = await getKindrawDraft(itemId);
      const restoredContent =
        draft && isDraftNewer(draft.updatedAt, response.item.updatedAt)
          ? draft.content
          : response.content;

      startTransition(() => {
        setItemResponse({
          item: response.item,
          content: restoredContent,
          collaborationRoom: response.collaborationRoom,
        });
        setTitle(response.item.title);
        setMarkdown(restoredContent);
        setLastSavedContent(response.content);
        setStatusMessage(
          draft && isDraftNewer(draft.updatedAt, response.item.updatedAt)
            ? "Rascunho local restaurado."
            : "Documento sincronizado.",
        );
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [itemId]);

  useEffect(() => {
    void loadItem();
  }, [itemId, loadItem]);

  const persistContent = useCallback(
    async (content: string) => {
      const timestamp = new Date().toISOString();
      setSaveState("saving");
      await setKindrawDraft(itemId, {
        content,
        updatedAt: timestamp,
      });

      try {
        await updateItemContent(itemId, content);
        setLastSavedContent(content);
        setSaveState("idle");
        setStatusMessage("Documento salvo.");
        setItemResponse((current) =>
          current
            ? {
                item: {
                  ...current.item,
                  updatedAt: timestamp,
                },
                content,
                collaborationRoom: current.collaborationRoom,
              }
            : current,
        );
        await onTreeRefresh();
      } catch (error) {
        setSaveState("error");
        setStatusMessage(
          getErrorMessage(error, "Falha ao salvar o documento."),
        );
      }
    },
    [itemId, onTreeRefresh],
  );

  useEffect(() => {
    if (!itemResponse) {
      return;
    }

    if (markdown === lastSavedContent) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      void persistContent(markdown);
    }, 900);

    return () => {
      window.clearTimeout(saveTimeout);
    };
  }, [itemResponse, lastSavedContent, markdown, persistContent]);

  // Flush on unmount / troca de item: se houver edição pendente (dentro da
  // janela do debounce), persiste agora para NÃO perder a última edição ao
  // navegar/fechar. Usamos refs p/ ler os valores mais recentes sem re-armar o
  // effect (que só roda no unmount).
  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = () => {
    if (!itemResponse || markdown === lastSavedContent) {
      return;
    }
    // dispara o save (best-effort) e grava o rascunho local imediatamente —
    // mesmo que a request seja interrompida, o draft sobrevive e é restaurado.
    void persistContent(markdown);
  };
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  const commitTitle = useCallback(async () => {
    if (!itemResponse) {
      return;
    }

    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(itemResponse.item.title);
      return;
    }

    if (nextTitle === itemResponse.item.title) {
      return;
    }

    try {
      await updateItemMeta(itemId, { title: nextTitle });
      setItemResponse((current) =>
        current
          ? {
              ...current,
              item: {
                ...current.item,
                title: nextTitle,
              },
            }
          : current,
      );
      setStatusMessage("Titulo atualizado.");
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, "Falha ao atualizar o titulo."));
      setTitle(itemResponse.item.title);
    }
  }, [itemId, itemResponse, onTreeRefresh, title]);

  const handleCreateShareLink = useCallback(async () => {
    try {
      const response = await createShareLink(itemId);
      setItemResponse((current) =>
        current
          ? {
              ...current,
              item: {
                ...current.item,
                shareLinks: [response.shareLink],
              },
            }
          : current,
      );
      setStatusMessage("Link publico criado.");
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, "Falha ao criar link publico."));
    }
  }, [itemId, onTreeRefresh]);

  const handleRevokeShareLink = useCallback(
    async (shareLinkId: string) => {
      try {
        await revokeShareLink(shareLinkId);
        setItemResponse((current) =>
          current
            ? {
                ...current,
                item: {
                  ...current.item,
                  shareLinks: [],
                },
              }
            : current,
        );
        await onTreeRefresh();
      } catch (error) {
        setStatusMessage(
          getErrorMessage(error, "Falha ao revogar link publico."),
        );
      }
    },
    [onTreeRefresh],
  );

  if (errorMessage) {
    return (
      <div className="kindraw-empty-state">
        <h2>Documento indisponivel</h2>
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!itemResponse) {
    return (
      <div className="kindraw-loading-shell">
        <p>{statusMessage}</p>
      </div>
    );
  }

  const hybridMeta = itemResponse.item.hybrid || null;
  const folderName =
    folders?.find((folder) => folder.id === itemResponse.item.folderId)?.name ||
    "Biblioteca";

  return (
    <div className="kindraw-editor-shell">
      <header className="kindraw-editor-header">
        <div className="kindraw-editor-header__leading">
          <button
            aria-label="Voltar para a pasta"
            className="kindraw-iconbtn"
            onClick={() =>
              navigateKindraw(buildFolderPath(itemResponse.item.folderId))
            }
            type="button"
          >
            <KindrawIcon name="back" size={17} />
          </button>
          <span className="kindraw-editor-crumb">{folderName} /</span>
          <div className="kindraw-editor-title">
            <input
              aria-label="Titulo do documento"
              className="kindraw-editor-title__input"
              onBlur={() => void commitTitle()}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              size={Math.min(Math.max(title.length, 4), 48)}
              type="text"
              value={title}
            />
            <KindrawIcon name="pen" size={13} />
          </div>
        </div>
        <div className="kindraw-editor-header__trailing">
          <span
            className={`kindraw-pill kindraw-pill--${
              saveState === "idle" ? "ok" : saveState
            }`}
            title={statusMessage}
          >
            <i />
            <span>{statusMessage}</span>
          </span>
          {hybridMeta ? (
            <button
              className="kindraw-btn kindraw-btn--ghost kindraw-btn--sm"
              onClick={() =>
                navigateKindraw(
                  buildHybridPath(hybridMeta.hybridId, {
                    view: hybridMeta.defaultView,
                  }),
                )
              }
              type="button"
            >
              <KindrawIcon name="hybrid" size={15} /> Abrir híbrido
            </button>
          ) : null}
          <ShareLinksPanel
            busy={saveState === "saving"}
            onCreateShareLink={handleCreateShareLink}
            onRevokeShareLink={handleRevokeShareLink}
            shareLinks={itemResponse.item.shareLinks}
          />
        </div>
      </header>

      <div className="kindraw-editor-body kindraw-editor-body--doc">
        <div className="kindraw-doc-layout kindraw-doc-layout--rte">
          <RichTextEditor
            onChange={setMarkdown}
            placeholder="Escreva aqui…"
            value={markdown}
          />
        </div>
      </div>
    </div>
  );
};
