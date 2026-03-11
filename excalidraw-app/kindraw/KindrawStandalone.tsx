import { t } from "@excalidraw/excalidraw/i18n";
import { useCallback, useEffect, useState, startTransition } from "react";

import {
  getPublicItem,
  getSession,
  getWorkspaceTree,
  openGithubLogin,
} from "./api";
import { DocEditorPage } from "./DocEditorPage";
import { HybridEditorPage } from "./HybridEditorPage";
import { HybridPublicShareView } from "./HybridPublicShareView";
import { createKindrawItemPageMeta, syncKindrawPageMeta } from "./pageMeta";
import { isKindrawHybridItem } from "./types";
import { getErrorMessage } from "./utils";
import "./kindraw.scss";

import type {
  KindrawHybridView,
  KindrawItem,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawWorkspaceTreeResponse,
} from "./types";

const useStandaloneSessionTree = () => {
  const [session, setSession] = useState<KindrawSession | null | undefined>(
    undefined,
  );
  const [tree, setTree] = useState<KindrawWorkspaceTreeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    try {
      const nextTree = await getWorkspaceTree();
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

        const nextTree = await getWorkspaceTree();
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

  return {
    errorMessage,
    refreshTree,
    session,
    tree,
  };
};

const createItemsById = (tree: KindrawWorkspaceTreeResponse | null) =>
  Object.fromEntries(
    (tree?.items || [])
      .filter((item): item is KindrawItem => !isKindrawHybridItem(item))
      .map((item) => [item.id, item]),
  );

type KindrawDocScreenProps = {
  itemId: string;
};

export const KindrawDocScreen = ({ itemId }: KindrawDocScreenProps) => {
  const { errorMessage, refreshTree, session, tree } =
    useStandaloneSessionTree();
  const currentItemTitle =
    tree?.items.find((item) =>
      item.kind === "hybrid"
        ? item.docItemId === itemId || item.drawingItemId === itemId
        : item.id === itemId,
    )?.title || null;

  useEffect(() => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: currentItemTitle,
        kind: "doc",
        url: window.location.href,
      }) || {
        url: window.location.href,
      },
    );
  }, [currentItemTitle, itemId]);

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
        itemsById={createItemsById(tree)}
        onTreeRefresh={refreshTree}
      />
    </div>
  );
};

type KindrawHybridScreenProps = {
  hybridId: string;
  view: KindrawHybridView;
  sectionId: string | null;
};

export const KindrawHybridScreen = ({
  hybridId,
  view,
  sectionId,
}: KindrawHybridScreenProps) => {
  const { errorMessage, refreshTree, session, tree } =
    useStandaloneSessionTree();
  const currentHybridTitle =
    tree?.items.find((item) => item.kind === "hybrid" && item.id === hybridId)
      ?.title || null;

  useEffect(() => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: currentHybridTitle,
        kind: "doc",
        url: window.location.href,
      }) || {
        url: window.location.href,
      },
    );
  }, [currentHybridTitle, hybridId]);

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
          <h1>Entre para editar este artefato híbrido</h1>
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
    <HybridEditorPage
      hybridId={hybridId}
      initialSectionId={sectionId}
      initialView={view}
      itemsById={createItemsById(tree)}
      onTreeRefresh={refreshTree}
    />
  );
};

type KindrawPublicSharePageProps = {
  token: string;
  view?: "document" | "both" | "canvas";
  sectionId?: string | null;
};

export const KindrawPublicSharePage = ({
  token,
  view = "both",
  sectionId = null,
}: KindrawPublicSharePageProps) => {
  const [itemResponse, setItemResponse] =
    useState<KindrawPublicItemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadShare = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await getPublicItem(token, { view });
      startTransition(() => {
        setItemResponse(response);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [token, view]);

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  useEffect(() => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: itemResponse?.item.title,
        kind: itemResponse?.item.kind || "drawing",
        surface: "share",
        url: window.location.href,
      }) || {
        url: window.location.href,
      },
    );
  }, [itemResponse?.item.kind, itemResponse?.item.title, token]);

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

  const effectiveSectionId =
    sectionId || new URLSearchParams(window.location.search).get("section");

  return (
    <HybridPublicShareView
      itemResponse={itemResponse}
      sectionId={effectiveSectionId}
      shareToken={token}
      view={view}
    />
  );
};
