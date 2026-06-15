import { useCallback, useEffect, useState, startTransition } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";

import {
  createShareLink,
  disableCollaborationRoom,
  enableCollaborationRoom,
  getItem,
  revokeShareLink,
  updateItemContent,
  updateItemMeta,
} from "./api";
import { parseDrawingContent } from "./content";
import { KindrawIcon } from "./icons";
import { useKindrawI18n } from "./i18n";
import { buildFolderPath, buildHybridPath, navigateKindraw } from "./router";
import { ShareLinksPanel } from "./ShareLinksPanel";
import { getKindrawDraft, setKindrawDraft } from "./storage";
import { getErrorMessage, isDraftNewer } from "./utils";

import type { KindrawFolder, KindrawItemResponse } from "./types";

type DrawingEditorPageProps = {
  itemId: string;
  onTreeRefresh: () => Promise<void> | void;
  folders?: KindrawFolder[];
};

export const DrawingEditorPage = ({
  itemId,
  onTreeRefresh,
  folders,
}: DrawingEditorPageProps) => {
  const { t } = useKindrawI18n();
  const [itemResponse, setItemResponse] = useState<KindrawItemResponse | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(() =>
    t("kindraw.status.loadingDrawing"),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [serializedContent, setSerializedContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");

  const loadItem = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage(t("kindraw.status.loadingDrawing"));

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
        setInitialContent(restoredContent);
        setSerializedContent(restoredContent);
        setLastSavedContent(response.content);
        setStatusMessage(
          draft && isDraftNewer(draft.updatedAt, response.item.updatedAt)
            ? t("kindraw.status.draftRestored")
            : t("kindraw.status.drawingSynced"),
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
        setStatusMessage(t("kindraw.status.drawingSaved"));
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
          getErrorMessage(error, t("kindraw.status.drawingSaveFailed")),
        );
      }
    },
    [itemId, onTreeRefresh],
  );

  useEffect(() => {
    if (!initialContent) {
      return;
    }

    if (!serializedContent || serializedContent === lastSavedContent) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      void persistContent(serializedContent);
    }, 900);

    return () => {
      window.clearTimeout(saveTimeout);
    };
  }, [initialContent, lastSavedContent, persistContent, serializedContent]);

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
      setStatusMessage(t("kindraw.status.titleUpdated"));
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(
        getErrorMessage(error, t("kindraw.status.titleUpdateFailed")),
      );
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
      setStatusMessage(t("kindraw.status.publicLinkCreated"));
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(
        getErrorMessage(error, t("kindraw.status.publicLinkCreateFailed")),
      );
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
          getErrorMessage(error, t("kindraw.status.publicLinkRevokeFailed")),
        );
      }
    },
    [onTreeRefresh],
  );

  const handleToggleLiveSession = useCallback(async () => {
    if (!itemResponse) {
      return;
    }

    try {
      if (itemResponse.collaborationRoom) {
        await disableCollaborationRoom(itemId);
        setItemResponse((current) =>
          current
            ? {
                ...current,
                item: {
                  ...current.item,
                  collaborationRoomId: null,
                  collaborationEnabledAt: null,
                },
                collaborationRoom: null,
              }
            : current,
        );
        setStatusMessage(t("kindraw.status.liveSessionEnded"));
      } else {
        const response = await enableCollaborationRoom(itemId);
        setItemResponse((current) =>
          current
            ? {
                ...current,
                item: {
                  ...current.item,
                  collaborationRoomId: response.collaborationRoom.roomId,
                  collaborationEnabledAt: response.collaborationRoom.enabledAt,
                },
                collaborationRoom: response.collaborationRoom,
              }
            : current,
        );
        setStatusMessage(t("kindraw.status.liveSessionActive"));
      }
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(
        getErrorMessage(error, t("kindraw.status.liveSessionToggleFailed")),
      );
    }
  }, [itemId, itemResponse, onTreeRefresh]);

  if (errorMessage) {
    return (
      <div className="kindraw-empty-state">
        <h2>{t("kindraw.editor.unavailableTitle")}</h2>
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!itemResponse || !initialContent) {
    return (
      <div className="kindraw-loading-shell">
        <p>{statusMessage}</p>
      </div>
    );
  }

  const hybridMeta = itemResponse.item.hybrid || null;
  const liveSessionActive = Boolean(itemResponse.collaborationRoom);
  const folderName =
    folders?.find((folder) => folder.id === itemResponse.item.folderId)?.name ||
    t("kindraw.sidebar.backToLibrary");

  return (
    <div className="kindraw-editor-shell">
      <header className="kindraw-editor-header">
        <div className="kindraw-editor-header__leading">
          <button
            aria-label={t("kindraw.editor.backToFolderAria")}
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
              aria-label={t("kindraw.editor.titleInputAria")}
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
              <KindrawIcon name="hybrid" size={15} />{" "}
              {t("kindraw.editor.openHybrid")}
            </button>
          ) : null}
          <button
            className={`kindraw-btn kindraw-btn--soft${
              liveSessionActive ? " kindraw-btn--live-on" : ""
            }`}
            onClick={() => void handleToggleLiveSession()}
            title={
              liveSessionActive
                ? t("kindraw.editor.endLiveSession")
                : t("kindraw.editor.startLiveSession")
            }
            type="button"
          >
            <KindrawIcon name="users" size={16} />{" "}
            {t("kindraw.editor.liveSession")}
          </button>
          <ShareLinksPanel
            busy={saveState === "saving"}
            onCreateShareLink={handleCreateShareLink}
            onRevokeShareLink={handleRevokeShareLink}
            shareLinks={itemResponse.item.shareLinks}
          />
        </div>
      </header>

      <div className="kindraw-editor-canvas">
        <Excalidraw
          initialData={parseDrawingContent(initialContent)}
          onChange={(elements, appState, files) => {
            setSerializedContent(
              serializeAsJSON(elements, appState, files, "local"),
            );
          }}
        />
      </div>
    </div>
  );
};
