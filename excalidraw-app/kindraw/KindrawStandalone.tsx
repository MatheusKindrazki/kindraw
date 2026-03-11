import { Excalidraw } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { useCallback, useEffect, useState, startTransition } from "react";

import { getPublicItem, getSession, getTree, openGithubLogin } from "./api";
import { DocEditorPage } from "./DocEditorPage";
import { createPublicDrawingInitialData } from "./content";
import { MarkdownPreview } from "./MarkdownPreview";
import { getErrorMessage } from "./utils";
import "./kindraw.scss";

import type {
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawTreeResponse,
} from "./types";

type KindrawDocScreenProps = {
  itemId: string;
};

export const KindrawDocScreen = ({ itemId }: KindrawDocScreenProps) => {
  const [session, setSession] = useState<KindrawSession | null | undefined>(
    undefined,
  );
  const [tree, setTree] = useState<KindrawTreeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    try {
      const nextTree = await getTree();
      startTransition(() => {
        setTree(nextTree);
      });
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, t("kindraw.status.workspaceRefreshFailed")),
      );
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setErrorMessage(null);

      try {
        const nextSession = await getSession();
        startTransition(() => {
          setSession(nextSession);
        });

        if (!nextSession) {
          setTree(null);
          return;
        }

        const nextTree = await getTree();
        startTransition(() => {
          setTree(nextTree);
        });
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, t("kindraw.status.workspaceLoadFailed")),
        );
        setSession(null);
      }
    };

    void load();
  }, []);

  if (typeof session === "undefined") {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.publicView.loadingDocument")}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-eyebrow">Kindraw</span>
          <h1>{t("kindraw.publicView.signInToEditDocTitle")}</h1>
          <div className="kindraw-toolbar">
            <button
              className="kindraw-button"
              onClick={openGithubLogin}
              type="button"
            >
              {t("kindraw.actions.signInWithGitHub")}
            </button>
            <a className="kindraw-link-button" href="/">
              {t("kindraw.publicView.backToCanvas")}
            </a>
          </div>
          {errorMessage ? (
            <p className="kindraw-error-copy">{errorMessage}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.sidebar.loadingWorkspace")}</p>
      </div>
    );
  }

  return (
    <div className="kindraw-doc-screen">
      <DocEditorPage
        itemId={itemId}
        itemsById={Object.fromEntries(
          tree.items.map((item) => [item.id, item]),
        )}
        onTreeRefresh={refreshTree}
      />
    </div>
  );
};

type KindrawPublicSharePageProps = {
  token: string;
};

export const KindrawPublicSharePage = ({
  token,
}: KindrawPublicSharePageProps) => {
  const [itemResponse, setItemResponse] =
    useState<KindrawPublicItemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadShare = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await getPublicItem(token);
      startTransition(() => {
        setItemResponse(response);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [token]);

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  if (errorMessage) {
    return (
      <div className="kindraw-share-shell">
        <div className="kindraw-empty-state">
          <h2>{t("kindraw.publicView.invalidTitle")}</h2>
          <p>{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (!itemResponse) {
    return (
      <div className="kindraw-share-shell">
        <p className="kindraw-loading-shell">
          {t("kindraw.publicView.loadingPublicView")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`kindraw-share-shell${
        itemResponse.item.kind === "drawing"
          ? " kindraw-share-shell--public-canvas"
          : ""
      }`}
    >
      {itemResponse.item.kind === "drawing" ? (
        <>
          <header className="kindraw-public-view__header kindraw-public-view__header--overlay">
            <div>
              <span className="kindraw-eyebrow">
                {t("kindraw.publicView.eyebrow")}
              </span>
              <h1>{itemResponse.item.title}</h1>
              <p>{t("kindraw.publicView.description")}</p>
            </div>
          </header>

          <section className="kindraw-public-view__canvas">
            <div className="kindraw-public-view__canvas-backdrop" />
            <div className="kindraw-public-view__canvas-stage">
              <Excalidraw
                initialData={createPublicDrawingInitialData(itemResponse.content)}
                UIOptions={{
                  canvasActions: {
                    clearCanvas: false,
                    export: false,
                    loadScene: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                    toggleTheme: false,
                  },
                }}
                renderTopLeftUI={() => null}
                renderTopRightUI={() => null}
                viewModeEnabled={true}
                zenModeEnabled={true}
              />
            </div>
          </section>
        </>
      ) : (
        <>
          <header className="kindraw-public-view__header">
            <div>
              <span className="kindraw-eyebrow">
                {t("kindraw.publicView.eyebrow")}
              </span>
              <h1>{itemResponse.item.title}</h1>
              <p>{t("kindraw.publicView.description")}</p>
            </div>
          </header>

          <section className="kindraw-share-shell__content">
            <MarkdownPreview markdown={itemResponse.content} />
          </section>
        </>
      )}
    </div>
  );
};
