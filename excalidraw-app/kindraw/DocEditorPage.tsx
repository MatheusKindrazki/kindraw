import {
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  startTransition,
} from "react";
import CodeMirrorEditor from "@excalidraw/excalidraw/components/TTDDialog/CodeMirrorEditor";

import {
  buildPublicShareUrl,
  createShareLink,
  getItem,
  revokeShareLink,
  updateItemContent,
  updateItemMeta,
} from "./api";
import { MarkdownPreview } from "./MarkdownPreview";
import { buildFolderPath, navigateKindraw } from "./router";
import { ShareLinksPanel } from "./ShareLinksPanel";
import { getKindrawDraft, setKindrawDraft } from "./storage";
import { getErrorMessage, isDraftNewer } from "./utils";

import type { KindrawItem, KindrawItemResponse } from "./types";

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    console.warn("Failed to copy Kindraw share link:", error);
    return false;
  }
};

type DocEditorPageProps = {
  itemId: string;
  itemsById: Record<string, KindrawItem>;
  onTreeRefresh: () => Promise<void> | void;
};

export const DocEditorPage = ({
  itemId,
  itemsById,
  onTreeRefresh,
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
  const deferredMarkdown = useDeferredValue(markdown);

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
      const publicUrl = buildPublicShareUrl(response.shareLink.token);
      const copied = await copyToClipboard(publicUrl);
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
      setStatusMessage(
        copied ? "Link publico criado e copiado." : "Link publico criado.",
      );
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

  return (
    <div className="kindraw-editor-shell">
      <header className="kindraw-editor-header">
        <div className="kindraw-editor-header__leading">
          <button
            className="kindraw-link-button"
            onClick={() =>
              navigateKindraw(buildFolderPath(itemResponse.item.folderId))
            }
            type="button"
          >
            Voltar
          </button>
          <input
            className="kindraw-title-input"
            onBlur={() => void commitTitle()}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            type="text"
            value={title}
          />
        </div>
        <div className="kindraw-editor-header__status">
          <span
            className={`kindraw-status-pill kindraw-status-pill--${saveState}`}
          >
            {statusMessage}
          </span>
        </div>
      </header>

      <div className="kindraw-doc-layout">
        <section className="kindraw-doc-layout__editor">
          <CodeMirrorEditor
            onChange={setMarkdown}
            placeholder="Escreva em Markdown..."
            theme="light"
            value={markdown}
          />
        </section>
        <section className="kindraw-doc-layout__preview">
          <MarkdownPreview
            emptyMessage="Comece escrevendo para ver o preview."
            itemsById={itemsById}
            markdown={deferredMarkdown}
            onNavigate={(pathname) => navigateKindraw(pathname)}
          />
        </section>
      </div>

      <ShareLinksPanel
        busy={saveState === "saving"}
        onCreateShareLink={handleCreateShareLink}
        onRevokeShareLink={handleRevokeShareLink}
        shareLinks={itemResponse.item.shareLinks}
      />
    </div>
  );
};
