import {
  Excalidraw,
  CaptureUpdateAction,
  reconcileElements,
  serializeAsJSON,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  useState,
  useSyncExternalStore,
} from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  GithubIcon,
  LinkIcon,
  clipboard,
  usersIcon,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import {
  getCollaborationLinkData,
  importFromBackend,
  isCollaborationLink,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";

import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { AIComponents } from "./components/AI";

import "./index.scss";

import { AppSidebar } from "./components/AppSidebar";
import {
  archiveItem,
  deleteItem,
  createFolder,
  createItem,
  disableCollaborationRoom,
  enableCollaborationRoom,
  createShareLink,
  buildPublicShareUrl,
  getCollaborationRoomBootstrap,
  getItem,
  getSession,
  getTree,
  logout as logoutKindraw,
  openGithubLogin,
  revokeShareLink,
  restoreItem,
  updateItemMeta,
  updateItemContent,
} from "./kindraw/api";
import {
  createInitialItemContent,
  parseDrawingContent,
} from "./kindraw/content";
import {
  buildItemPath,
  getLocationPathname,
  matchKindrawRoute,
  navigateKindraw,
  shouldAutoCreateRootDrawing,
  subscribeToLocation,
} from "./kindraw/router";
import { generateKindrawCanvasTitle } from "./kindraw/naming";
import { getKindrawDraft, setKindrawDraft } from "./kindraw/storage";
import { getErrorMessage, isDraftNewer } from "./kindraw/utils";

import type { CollabAPI } from "./collab/Collab";
import type {
  KindrawItem,
  KindrawCollaborationBootstrapResponse,
  KindrawCollaborationRoom,
  KindrawItemKind,
  KindrawSession,
  KindrawTreeResponse,
} from "./kindraw/types";

const getNextActiveDrawingPath = (
  items: KindrawItem[],
  excludedItemId?: string,
) => {
  const nextItem =
    [...items]
      .filter(
        (item) =>
          item.kind === "drawing" &&
          !item.archivedAt &&
          item.id !== excludedItemId,
      )
      .sort((a, b) => {
        const byUpdatedAt =
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return byUpdatedAt || a.title.localeCompare(b.title);
      })[0] || null;

  return nextItem ? buildItemPath(nextItem) : "/";
};

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    console.warn("Failed to copy Kindraw link:", error);
    return false;
  }
};

const getKindrawUserDisplayName = (session: KindrawSession["user"]) =>
  session.name.trim() || session.githubLogin;

const getUserInitial = (label: string) =>
  label.trim().charAt(0).toUpperCase() || "K";

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = importFromLocalStorage();

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
        );

        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true,
            }),
            localDataState?.elements,
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState,
          ),
        };
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = isRunningInIframe();

  const { editorTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  const setAppState = useExcalidrawSetAppState();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocationPathname,
    getLocationPathname,
  );
  const kindrawRoute = useMemo(() => matchKindrawRoute(pathname), [pathname]);
  const [kindrawSession, setKindrawSession] = useState<
    KindrawSession | null | undefined
  >(undefined);
  const [kindrawTree, setKindrawTree] = useState<KindrawTreeResponse | null>(
    null,
  );
  const [kindrawBusy, setKindrawBusy] = useState(false);
  const [kindrawCurrentItem, setKindrawCurrentItem] =
    useState<KindrawItem | null>(null);
  const [kindrawCurrentCollaborationRoom, setKindrawCurrentCollaborationRoom] =
    useState<KindrawCollaborationRoom | null>(null);
  const [kindrawDrawingStatus, setKindrawDrawingStatus] = useState<
    string | null
  >(null);
  const [kindrawDrawingSaveState, setKindrawDrawingSaveState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [kindrawLoadingDrawingId, setKindrawLoadingDrawingId] = useState<
    string | null
  >(null);
  const [kindrawIsEditingTitle, setKindrawIsEditingTitle] = useState(false);
  const [kindrawDraftTitle, setKindrawDraftTitle] = useState("");
  const kindrawApplyingSceneRef = useRef(false);
  const kindrawAutoCreateRootRef = useRef(false);
  const kindrawAutoJoinCollabRoomRef = useRef<string | null>(null);
  const kindrawLastSavedContentRef = useRef<string | null>(null);
  const kindrawSaveTimeoutRef = useRef<number | null>(null);
  const kindrawTitleInputRef = useRef<HTMLInputElement | null>(null);

  const refreshKindrawTree = useCallback(async () => {
    if (!kindrawSession) {
      return;
    }

    try {
      const nextTree = await getTree();
      startTransition(() => {
        setKindrawTree(nextTree);
      });
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, t("kindraw.status.workspaceRefreshFailed")),
      );
    }
  }, [kindrawSession]);

  const loadKindrawSession = useCallback(async () => {
    try {
      const nextSession = await getSession();
      startTransition(() => {
        setKindrawSession(nextSession);
      });

      if (!nextSession) {
        setKindrawTree(null);
        return;
      }

      const nextTree = await getTree();
      startTransition(() => {
        setKindrawTree(nextTree);
      });
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, t("kindraw.status.workspaceLoadFailed")),
      );
      setKindrawSession(null);
    }
  }, []);

  useEffect(() => {
    void loadKindrawSession();
  }, [loadKindrawSession]);

  useEffect(() => {
    if (!collabAPI) {
      return;
    }

    if (kindrawSession?.user) {
      collabAPI.setUserProfile({
        userId: kindrawSession.user.id,
        username: getKindrawUserDisplayName(kindrawSession.user),
        avatarUrl: kindrawSession.user.avatarUrl,
        githubLogin: kindrawSession.user.githubLogin,
      });
      return;
    }

    const currentProfile = collabAPI.getUserProfile();
    if (currentProfile?.githubLogin || currentProfile?.avatarUrl) {
      collabAPI.setUserProfile(null);
    }
  }, [collabAPI, kindrawSession]);

  useEffect(() => {
    if (kindrawRoute.kind === "drawing" || kindrawRoute.kind === "doc") {
      const nextItem =
        kindrawTree?.items.find((item) => item.id === kindrawRoute.itemId) ||
        null;
      setKindrawCurrentItem(nextItem);

      if (kindrawTree && !nextItem && !kindrawBusy) {
        navigateKindraw("/", { replace: true });
      }
      return;
    }

    setKindrawCurrentItem(null);
  }, [kindrawBusy, kindrawRoute, kindrawTree]);

  const runKindrawMutation = useCallback(
    async (action: () => Promise<void> | void) => {
      setKindrawBusy(true);
      try {
        await action();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setKindrawBusy(false);
      }
    },
    [],
  );

  const handleKindrawCreateFolder = useCallback(
    async (parentId: string | null, name: string) => {
      const nextName = name.trim();
      if (!nextName) {
        return null;
      }

      let createdFolderId: string | null = null;
      await runKindrawMutation(async () => {
        const response = await createFolder(nextName, parentId);
        createdFolderId = response.folderId;
        await refreshKindrawTree();
      });

      return createdFolderId;
    },
    [refreshKindrawTree, runKindrawMutation],
  );

  const handleKindrawAssignTag = useCallback(
    async (itemId: string, folderId: string | null) => {
      await runKindrawMutation(async () => {
        await updateItemMeta(itemId, { folderId });

        startTransition(() => {
          setKindrawTree((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === itemId ? { ...item, folderId } : item,
                  ),
                }
              : current,
          );
          setKindrawCurrentItem((current) =>
            current && current.id === itemId
              ? {
                  ...current,
                  folderId,
                }
              : current,
          );
        });

        await refreshKindrawTree();
      });
    },
    [refreshKindrawTree, runKindrawMutation],
  );

  const handleKindrawArchiveItem = useCallback(
    async (itemId: string, archived: boolean) => {
      const timestamp = new Date().toISOString();
      const isCurrent = kindrawCurrentItem?.id === itemId;
      const nextItems =
        kindrawTree?.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                archivedAt: archived ? item.archivedAt || timestamp : null,
                updatedAt: timestamp,
              }
            : item,
        ) || [];

      await runKindrawMutation(async () => {
        await (archived ? archiveItem(itemId) : restoreItem(itemId));

        startTransition(() => {
          setKindrawTree((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          archivedAt: archived
                            ? item.archivedAt || timestamp
                            : null,
                          updatedAt: timestamp,
                        }
                      : item,
                  ),
                }
              : current,
          );
          setKindrawCurrentItem((current) =>
            current && current.id === itemId
              ? {
                  ...current,
                  archivedAt: archived ? current.archivedAt || timestamp : null,
                  updatedAt: timestamp,
                }
              : current,
          );
          if (archived && isCurrent) {
            setKindrawCurrentCollaborationRoom(null);
          }
        });

        if (archived && isCurrent) {
          navigateKindraw(getNextActiveDrawingPath(nextItems, itemId), {
            replace: true,
          });
        }

        await refreshKindrawTree();
      });
    },
    [
      kindrawCurrentItem?.id,
      kindrawTree?.items,
      refreshKindrawTree,
      runKindrawMutation,
    ],
  );

  const handleKindrawDeleteItem = useCallback(
    async (itemId: string) => {
      const shouldDelete = window.confirm(
        t("kindraw.sidebar.deleteCanvasConfirm"),
      );
      if (!shouldDelete) {
        return;
      }

      const isCurrent = kindrawCurrentItem?.id === itemId;
      const nextItems =
        kindrawTree?.items.filter((item) => item.id !== itemId) || [];

      await runKindrawMutation(async () => {
        await deleteItem(itemId);

        startTransition(() => {
          setKindrawTree((current) =>
            current
              ? {
                  ...current,
                  items: current.items.filter((item) => item.id !== itemId),
                }
              : current,
          );
          setKindrawCurrentItem((current) =>
            current?.id === itemId ? null : current,
          );
          if (isCurrent) {
            setKindrawCurrentCollaborationRoom(null);
          }
        });

        if (isCurrent) {
          navigateKindraw(getNextActiveDrawingPath(nextItems), {
            replace: true,
          });
        }

        await refreshKindrawTree();
      });
    },
    [
      kindrawCurrentItem?.id,
      kindrawTree?.items,
      refreshKindrawTree,
      runKindrawMutation,
    ],
  );

  const handleKindrawCreateItem = useCallback(
    async (
      kind: KindrawItemKind,
      folderId: string | null,
      title: string,
      opts?: {
        replace?: boolean;
      },
    ) => {
      const nextTitle = title.trim() || generateKindrawCanvasTitle();
      if (!nextTitle) {
        return;
      }

      await runKindrawMutation(async () => {
        const response = await createItem({
          kind,
          title: nextTitle,
          folderId,
          content: createInitialItemContent(kind, nextTitle),
        });
        const timestamp = new Date().toISOString();

        startTransition(() => {
          setKindrawTree((current) =>
            current
              ? {
                  ...current,
                  items: [
                    {
                      id: response.itemId,
                      kind,
                      title: nextTitle,
                      folderId,
                      ownerId: kindrawSession?.user.id || "pending",
                      updatedAt: timestamp,
                      createdAt: timestamp,
                      archivedAt: null,
                      shareLinks: [],
                      collaborationRoomId: null,
                      collaborationEnabledAt: null,
                    },
                    ...current.items,
                  ],
                }
              : current,
          );
        });

        navigateKindraw(
          buildItemPath({
            id: response.itemId,
            kind,
          }),
          { replace: opts?.replace },
        );
        await refreshKindrawTree();
      });
    },
    [kindrawSession?.user.id, refreshKindrawTree, runKindrawMutation],
  );

  useEffect(() => {
    if (
      !kindrawSession ||
      !shouldAutoCreateRootDrawing(pathname, kindrawRoute)
    ) {
      kindrawAutoCreateRootRef.current = false;
      return;
    }

    if (kindrawBusy || kindrawAutoCreateRootRef.current) {
      return;
    }

    kindrawAutoCreateRootRef.current = true;
    void handleKindrawCreateItem(
      "drawing",
      null,
      generateKindrawCanvasTitle(),
      {
        replace: true,
      },
    );
  }, [
    handleKindrawCreateItem,
    kindrawBusy,
    kindrawRoute,
    kindrawSession,
    pathname,
  ]);

  const handleKindrawLogout = useCallback(async () => {
    await runKindrawMutation(async () => {
      await logoutKindraw();
      collabAPI?.setUserProfile(null);
      setKindrawSession(null);
      setKindrawTree(null);
      setKindrawCurrentItem(null);
      setKindrawCurrentCollaborationRoom(null);
      navigateKindraw("/", { replace: true });
    });
  }, [collabAPI, runKindrawMutation]);

  const createKindrawShareLinkInternal = useCallback(async () => {
    if (!kindrawCurrentItem) {
      return null;
    }

    const response = await createShareLink(kindrawCurrentItem.id);
    setKindrawCurrentItem({
      ...kindrawCurrentItem,
      shareLinks: [response.shareLink],
    });
    await refreshKindrawTree();
    return response.shareLink;
  }, [kindrawCurrentItem, refreshKindrawTree]);

  const handleKindrawCreateShareLink = useCallback(async () => {
    await runKindrawMutation(async () => {
      const shareLink = await createKindrawShareLinkInternal();
      if (!shareLink) {
        return;
      }

      const publicUrl = buildPublicShareUrl(shareLink.token);
      const copied = await copyToClipboard(publicUrl);
      const message = copied
        ? t("kindraw.status.publicLinkCreatedCopied")
        : t("kindraw.status.publicLinkCreated");

      setKindrawDrawingStatus(message);
      excalidrawAPI?.setToast({ message });
    });
  }, [createKindrawShareLinkInternal, excalidrawAPI, runKindrawMutation]);

  const handleKindrawPrimaryShareAction = useCallback(async () => {
    if (!kindrawCurrentItem) {
      return;
    }

    await runKindrawMutation(async () => {
      const activeShareLink = kindrawCurrentItem.shareLinks[0] || null;
      const shareLink =
        activeShareLink || (await createKindrawShareLinkInternal());

      if (!shareLink) {
        return;
      }

      const publicUrl = buildPublicShareUrl(shareLink.token);
      const copied = await copyToClipboard(publicUrl);
      const message = activeShareLink
        ? copied
          ? t("kindraw.status.publicLinkCopied")
          : t("kindraw.status.publicLinkReady")
        : copied
        ? t("kindraw.status.publicLinkCreatedCopied")
        : t("kindraw.status.publicLinkCreated");

      setKindrawDrawingStatus(message);
      excalidrawAPI?.setToast({ message });
    });
  }, [
    createKindrawShareLinkInternal,
    excalidrawAPI,
    kindrawCurrentItem,
    runKindrawMutation,
  ]);

  const handleKindrawRevokeShareLink = useCallback(
    async (shareLinkId: string) => {
      if (!kindrawCurrentItem) {
        return;
      }

      await runKindrawMutation(async () => {
        await revokeShareLink(shareLinkId);
        setKindrawCurrentItem({
          ...kindrawCurrentItem,
          shareLinks: [],
        });
        await refreshKindrawTree();
      });
    },
    [kindrawCurrentItem, refreshKindrawTree, runKindrawMutation],
  );

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          if (fileIds.length) {
            // Direct Firebase call (not through FileManager), so track manually
            FileStatusStore.updateStatuses(
              fileIds.map((id) => [id, "loading"]),
            );
          }
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
            FileStatusStore.updateStatuses([
              ...loadedFiles.map((f) => [f.id, "loaded"] as [FileId, "loaded"]),
              ...[...erroredFiles.keys()].map(
                (id) => [id, "error"] as [FileId, "error"],
              ),
            ]);
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(async ({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({
            currentFileIds: fileIds,
          });
        }
      }
    },
    [collabAPI, excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ collabAPI, excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          if (!kindrawSession) {
            collabAPI?.setUsername(username || "");
          }
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [
    isCollabDisabled,
    collabAPI,
    excalidrawAPI,
    kindrawSession,
    setLangCode,
    loadImages,
  ]);

  useEffect(() => {
    if (kindrawRoute.kind !== "drawing") {
      if (kindrawSaveTimeoutRef.current) {
        window.clearTimeout(kindrawSaveTimeoutRef.current);
        kindrawSaveTimeoutRef.current = null;
      }
      setKindrawDrawingSaveState("idle");
      setKindrawDrawingStatus(null);
      setKindrawLoadingDrawingId(null);
      setKindrawCurrentCollaborationRoom(null);
      kindrawAutoJoinCollabRoomRef.current = null;
      kindrawLastSavedContentRef.current = null;
      return;
    }

    if (!excalidrawAPI) {
      return;
    }

    const roomLinkData = getCollaborationLinkData(window.location.href);
    const isCollaborationDrawingRoute =
      roomLinkData?.roomId === kindrawRoute.itemId;

    if (!kindrawSession && !isCollaborationDrawingRoute) {
      return;
    }

    let cancelled = false;
    setKindrawLoadingDrawingId(kindrawRoute.itemId);

    const loadKindrawDrawing = async () => {
      try {
        let item: KindrawItem;
        let content: string;
        let collaborationRoom: KindrawCollaborationRoom | null;

        if (kindrawSession) {
          const response = await getItem(kindrawRoute.itemId);
          item = response.item;
          content = response.content;
          collaborationRoom = response.collaborationRoom;
        } else {
          const response: KindrawCollaborationBootstrapResponse =
            await getCollaborationRoomBootstrap(
              kindrawRoute.itemId,
              roomLinkData!.roomKey,
            );

          item = {
            id: response.item.id,
            kind: response.item.kind,
            title: response.item.title,
            folderId: null,
            ownerId: "shared",
            updatedAt: response.item.updatedAt,
            createdAt: response.item.createdAt,
            archivedAt: null,
            shareLinks: [],
            collaborationRoomId: response.collaborationRoom.roomId,
            collaborationEnabledAt: response.collaborationRoom.enabledAt,
          };
          content = response.content;
          collaborationRoom = response.collaborationRoom;
        }

        const draft = kindrawSession
          ? await getKindrawDraft(kindrawRoute.itemId)
          : null;
        const restoredContent =
          draft && isDraftNewer(draft.updatedAt, item.updatedAt)
            ? draft.content
            : content;
        const scene = parseDrawingContent(restoredContent);
        const restoredElements = restoreElements(scene.elements, null, {
          repairBindings: true,
        });
        const shouldHydrateSceneFromSnapshot =
          !isCollaborationDrawingRoute ||
          excalidrawAPI.getSceneElementsIncludingDeleted().length === 0;

        if (cancelled) {
          return;
        }

        kindrawApplyingSceneRef.current = shouldHydrateSceneFromSnapshot;
        kindrawLastSavedContentRef.current = content;
        startTransition(() => {
          setKindrawCurrentItem(item);
          setKindrawCurrentCollaborationRoom(collaborationRoom);
          setKindrawLoadingDrawingId(null);
          setKindrawDrawingSaveState("idle");
          setKindrawDrawingStatus(
            draft && isDraftNewer(draft.updatedAt, item.updatedAt)
              ? t("kindraw.status.draftRestored")
              : t("kindraw.status.drawingSynced"),
          );
        });

        if (shouldHydrateSceneFromSnapshot) {
          excalidrawAPI.updateScene({
            elements: restoredElements,
            appState: restoreAppState(
              scene.appState,
              excalidrawAPI.getAppState(),
            ),
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });

          const files = Object.values(scene.files || {});
          if (files.length) {
            excalidrawAPI.addFiles(files);
          }

          if (
            isCollaborationDrawingRoute &&
            collabAPI?.isCollaborating() &&
            restoredElements.length
          ) {
            collabAPI.seedCollaborationScene(restoredElements);
          }

          window.setTimeout(() => {
            kindrawApplyingSceneRef.current = false;
          }, 0);
        } else {
          kindrawApplyingSceneRef.current = false;
        }
      } catch (error) {
        if (!cancelled) {
          setKindrawLoadingDrawingId(null);
          setErrorMessage(
            getErrorMessage(error, t("kindraw.status.drawingLoadFailed")),
          );
        }
      }
    };

    void loadKindrawDrawing();

    return () => {
      cancelled = true;
      kindrawApplyingSceneRef.current = false;
    };
  }, [collabAPI, excalidrawAPI, kindrawRoute, kindrawSession]);

  const kindrawActiveCanvasTitle = useMemo(() => {
    if (kindrawRoute.kind !== "drawing") {
      return null;
    }

    return (
      kindrawTree?.items.find((item) => item.id === kindrawRoute.itemId)
        ?.title ||
      kindrawCurrentItem?.title ||
      null
    );
  }, [kindrawCurrentItem?.title, kindrawRoute, kindrawTree?.items]);

  useEffect(() => {
    setKindrawIsEditingTitle(false);
    setKindrawDraftTitle(kindrawActiveCanvasTitle || "");
  }, [kindrawActiveCanvasTitle, pathname]);

  useEffect(() => {
    if (!kindrawIsEditingTitle) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      kindrawTitleInputRef.current?.focus();
      kindrawTitleInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [kindrawIsEditingTitle]);

  const handleKindrawTitleEditStart = useCallback(() => {
    if (
      kindrawRoute.kind !== "drawing" ||
      !kindrawCurrentItem ||
      kindrawLoadingDrawingId === kindrawRoute.itemId
    ) {
      return;
    }

    setKindrawDraftTitle(kindrawActiveCanvasTitle || kindrawCurrentItem.title);
    setKindrawIsEditingTitle(true);
  }, [
    kindrawActiveCanvasTitle,
    kindrawCurrentItem,
    kindrawLoadingDrawingId,
    kindrawRoute,
  ]);

  const handleKindrawTitleEditCancel = useCallback(() => {
    setKindrawIsEditingTitle(false);
    setKindrawDraftTitle(kindrawActiveCanvasTitle || "");
  }, [kindrawActiveCanvasTitle]);

  const handleKindrawTitleEditCommit = useCallback(async () => {
    const itemId =
      kindrawRoute.kind === "drawing"
        ? kindrawRoute.itemId
        : kindrawCurrentItem?.id;
    const nextTitle = kindrawDraftTitle.trim();
    const previousTitle = kindrawCurrentItem?.title || kindrawActiveCanvasTitle;

    setKindrawIsEditingTitle(false);

    if (!itemId || !previousTitle) {
      setKindrawDraftTitle(kindrawActiveCanvasTitle || "");
      return;
    }

    if (!nextTitle || nextTitle === previousTitle) {
      setKindrawDraftTitle(previousTitle);
      return;
    }

    const updatedAt = new Date().toISOString();

    await runKindrawMutation(async () => {
      await updateItemMeta(itemId, { title: nextTitle });

      startTransition(() => {
        setKindrawTree((current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        title: nextTitle,
                        updatedAt,
                      }
                    : item,
                ),
              }
            : current,
        );
        setKindrawCurrentItem((current) =>
          current && current.id === itemId
            ? {
                ...current,
                title: nextTitle,
                updatedAt,
              }
            : current,
        );
      });

      await refreshKindrawTree();
    });
  }, [
    kindrawActiveCanvasTitle,
    kindrawCurrentItem?.id,
    kindrawCurrentItem?.title,
    kindrawDraftTitle,
    kindrawRoute,
    refreshKindrawTree,
    runKindrawMutation,
  ]);

  useEffect(() => {
    if (
      !collabAPI ||
      !kindrawSession ||
      kindrawBusy ||
      kindrawRoute.kind !== "drawing" ||
      !kindrawCurrentCollaborationRoom ||
      collabAPI.isCollaborating()
    ) {
      if (kindrawRoute.kind !== "drawing" || !kindrawCurrentCollaborationRoom) {
        kindrawAutoJoinCollabRoomRef.current = null;
      }
      return;
    }

    const currentRoomLink = getCollaborationLinkData(window.location.href);
    if (
      currentRoomLink?.roomId === kindrawCurrentCollaborationRoom.roomId &&
      currentRoomLink.roomKey === kindrawCurrentCollaborationRoom.roomKey
    ) {
      return;
    }

    if (
      kindrawAutoJoinCollabRoomRef.current ===
      kindrawCurrentCollaborationRoom.roomId
    ) {
      return;
    }

    kindrawAutoJoinCollabRoomRef.current =
      kindrawCurrentCollaborationRoom.roomId;
    void collabAPI.startCollaboration(kindrawCurrentCollaborationRoom);
  }, [
    collabAPI,
    kindrawBusy,
    kindrawCurrentCollaborationRoom,
    kindrawRoute,
    kindrawSession,
  ]);

  useEffect(() => {
    if (!collabAPI || !isCollaborating) {
      return;
    }

    const currentRoomLink = getCollaborationLinkData(window.location.href);
    if (!currentRoomLink) {
      return;
    }

    if (kindrawRoute.kind !== "drawing") {
      collabAPI.stopCollaboration(false);
      return;
    }

    if (
      kindrawCurrentCollaborationRoom &&
      currentRoomLink.roomId !== kindrawCurrentCollaborationRoom.roomId
    ) {
      collabAPI.stopCollaboration(false);
    }
  }, [
    collabAPI,
    isCollaborating,
    kindrawCurrentCollaborationRoom,
    kindrawRoute,
  ]);

  const persistKindrawDrawing = useCallback(
    async (
      itemId: string,
      content: string,
      currentItem: KindrawItem | null,
    ) => {
      const timestamp = new Date().toISOString();

      setKindrawDrawingSaveState("saving");
      setKindrawDrawingStatus(t("kindraw.status.drawingSaving"));

      await setKindrawDraft(itemId, {
        content,
        updatedAt: timestamp,
      });

      try {
        await updateItemContent(itemId, content);
        kindrawLastSavedContentRef.current = content;
        setKindrawDrawingSaveState("idle");
        setKindrawDrawingStatus(t("kindraw.status.drawingSaved"));
        if (currentItem) {
          setKindrawCurrentItem({
            ...currentItem,
            updatedAt: timestamp,
          });
        }
        await refreshKindrawTree();
      } catch (error) {
        setKindrawDrawingSaveState("error");
        setKindrawDrawingStatus(
          getErrorMessage(error, t("kindraw.status.drawingSaveFailed")),
        );
      }
    },
    [refreshKindrawTree],
  );

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    if (
      kindrawRoute.kind === "drawing" &&
      kindrawSession &&
      !kindrawApplyingSceneRef.current
    ) {
      const serialized = serializeAsJSON(elements, appState, files, "local");

      if (serialized !== kindrawLastSavedContentRef.current) {
        if (kindrawSaveTimeoutRef.current) {
          window.clearTimeout(kindrawSaveTimeoutRef.current);
        }

        kindrawDrawingSaveState !== "saving" &&
          setKindrawDrawingStatus("Alteracoes locais pendentes...");

        kindrawSaveTimeoutRef.current = window.setTimeout(() => {
          void persistKindrawDrawing(
            kindrawRoute.itemId,
            serialized,
            kindrawCurrentItem,
          );
        }, 900);
      }
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const handleStartRealtimeCollab = useCallback(async () => {
    if (!collabAPI) {
      return;
    }

    trackEvent("share", "room creation", `ui (${getFrame()})`);

    if (kindrawRoute.kind === "drawing" && kindrawSession) {
      await runKindrawMutation(async () => {
        const response = await enableCollaborationRoom(kindrawRoute.itemId);
        setKindrawCurrentCollaborationRoom(response.collaborationRoom);
        setKindrawCurrentItem((current) =>
          current && current.id === kindrawRoute.itemId
            ? {
                ...current,
                collaborationRoomId: response.collaborationRoom.roomId,
                collaborationEnabledAt: response.collaborationRoom.enabledAt,
              }
            : current,
        );
        await refreshKindrawTree();
        await collabAPI.startCollaboration(response.collaborationRoom, {
          bootstrapFromCurrentScene: true,
        });
      });
      return;
    }

    await collabAPI.startCollaboration(null);
  }, [
    collabAPI,
    kindrawRoute,
    kindrawSession,
    refreshKindrawTree,
    runKindrawMutation,
  ]);

  const handleStopRealtimeCollab = useCallback(async () => {
    if (!collabAPI) {
      return;
    }

    if (
      kindrawRoute.kind === "drawing" &&
      kindrawSession &&
      kindrawCurrentCollaborationRoom
    ) {
      await runKindrawMutation(async () => {
        await disableCollaborationRoom(kindrawRoute.itemId);
        setKindrawCurrentCollaborationRoom(null);
        setKindrawCurrentItem((current) =>
          current && current.id === kindrawRoute.itemId
            ? {
                ...current,
                collaborationRoomId: null,
                collaborationEnabledAt: null,
              }
            : current,
        );
        await refreshKindrawTree();
        collabAPI.stopCollaboration(false);
      });
      return;
    }

    collabAPI.stopCollaboration();
  }, [
    collabAPI,
    kindrawCurrentCollaborationRoom,
    kindrawRoute,
    kindrawSession,
    refreshKindrawTree,
    runKindrawMutation,
  ]);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  const handleRealtimeAction = useCallback(async () => {
    if (isCollaborating) {
      onCollabDialogOpen();
      return;
    }

    await handleStartRealtimeCollab();
    onCollabDialogOpen();
  }, [handleStartRealtimeCollab, isCollaborating, onCollabDialogOpen]);

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      // Yield initial progress
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      // Wait for all pending images to finish
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  // const onExport = () => {
  //   return new Promise((r) => setTimeout(r, 2500));
  //   // console.log("onExport");
  // };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <Excalidraw
        onChange={onChange}
        onExport={onExport}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
            export: {},
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        name={
          kindrawRoute.kind === "drawing"
            ? kindrawCurrentItem?.title
            : undefined
        }
        theme={editorTheme}
        renderTopRightUI={(isMobile) => {
          if (isMobile || !collabAPI || isCollabDisabled) {
            return null;
          }

          const isDrawingRoute = kindrawRoute.kind === "drawing";
          const shouldShowRealtimeAction = isDrawingRoute || isCollaborating;
          const isSwitchingCanvas =
            isDrawingRoute && kindrawLoadingDrawingId === kindrawRoute.itemId;
          const hasActivePublicLink =
            isDrawingRoute && !!kindrawCurrentItem?.shareLinks[0];

          return (
            <div className="excalidraw-ui-top-right kindraw-top-right-actions">
              {collabError.message && <CollabError collabError={collabError} />}
              {kindrawSession ? (
                <button
                  aria-label={getKindrawUserDisplayName(kindrawSession.user)}
                  className="kindraw-top-right-actions__avatar-button"
                  onClick={() =>
                    setAppState({
                      openSidebar: { name: "kindraw" },
                      openMenu: null,
                      openPopup: null,
                      openDialog: null,
                    })
                  }
                  title={getKindrawUserDisplayName(kindrawSession.user)}
                  type="button"
                >
                  <span className="kindraw-top-right-actions__avatar">
                    {kindrawSession.user.avatarUrl ? (
                      <img
                        alt={kindrawSession.user.name}
                        src={kindrawSession.user.avatarUrl}
                      />
                    ) : (
                      <span>
                        {getUserInitial(
                          getKindrawUserDisplayName(kindrawSession.user),
                        )}
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <button
                  className="kindraw-top-right-actions__button"
                  onClick={openGithubLogin}
                  type="button"
                >
                  {t("kindraw.actions.signInWithGitHub")}
                </button>
              )}
              {isDrawingRoute && kindrawCurrentItem ? (
                <button
                  aria-label={
                    hasActivePublicLink
                      ? t("kindraw.actions.copyPublicLink")
                      : t("kindraw.actions.publicLink")
                  }
                  className={`kindraw-top-right-actions__button kindraw-top-right-actions__button--icon${
                    hasActivePublicLink
                      ? " kindraw-top-right-actions__button--active"
                      : ""
                  }`}
                  disabled={isSwitchingCanvas}
                  onClick={() => void handleKindrawPrimaryShareAction()}
                  title={
                    hasActivePublicLink
                      ? t("kindraw.actions.copyPublicLink")
                      : t("kindraw.actions.publicLink")
                  }
                  type="button"
                >
                  {hasActivePublicLink ? clipboard : LinkIcon}
                </button>
              ) : null}
              {shouldShowRealtimeAction ? (
                <button
                  aria-label={
                    isCollaborating
                      ? t("kindraw.actions.manageCollaboration")
                      : t("kindraw.actions.startCollaboration")
                  }
                  className={`kindraw-top-right-actions__button kindraw-top-right-actions__button--icon${
                    isCollaborating
                      ? " kindraw-top-right-actions__button--active"
                      : ""
                  }`}
                  disabled={isSwitchingCanvas}
                  onClick={handleRealtimeAction}
                  title={
                    isCollaborating
                      ? t("kindraw.actions.manageCollaboration")
                      : t("kindraw.actions.startCollaboration")
                  }
                  type="button"
                >
                  {usersIcon}
                </button>
              ) : null}
            </div>
          );
        }}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            excalidrawAPI?.scrollToContent(element.link, { animate: true });
          }
        }}
      >
        <AppMainMenu
          currentCanvasStatus={kindrawDrawingStatus}
          currentCanvasTitle={kindrawActiveCanvasTitle}
          draftCanvasTitle={kindrawDraftTitle}
          isEditingCanvasTitle={kindrawIsEditingTitle}
          isLoadingCanvas={
            kindrawRoute.kind === "drawing" &&
            kindrawLoadingDrawingId === kindrawRoute.itemId
          }
          canvasTitleInputRef={kindrawTitleInputRef}
          onCanvasTitleCancel={handleKindrawTitleEditCancel}
          onCanvasTitleChange={setKindrawDraftTitle}
          onCanvasTitleCommit={() => void handleKindrawTitleEditCommit()}
          onCanvasTitleDoubleClick={handleKindrawTitleEditStart}
        />
        <AppWelcomeScreen
          currentItemTitle={kindrawCurrentItem?.title || null}
          kindrawSession={kindrawSession}
          onGithubLogin={openGithubLogin}
          onCollabDialogOpen={handleRealtimeAction}
          isCollabEnabled={!isCollabDisabled}
          routeKind={kindrawRoute.kind}
        />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />
        {excalidrawAPI && <AIComponents excalidrawAPI={excalidrawAPI} />}
        {isCollaborating && isOffline && (
          <div className="alertalert--warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        {excalidrawAPI && !isCollabDisabled && (
          <Collab excalidrawAPI={excalidrawAPI} />
        )}

        <ShareDialog
          collabAPI={collabAPI}
          collaboration={{
            busy: kindrawBusy,
            onStartCollaboration: handleStartRealtimeCollab,
            onStopCollaboration: handleStopRealtimeCollab,
          }}
          publicShare={{
            busy: kindrawBusy || kindrawDrawingSaveState === "saving",
            currentItem: kindrawCurrentItem,
            onCreateShareLink: handleKindrawCreateShareLink,
            onRevokeShareLink: handleKindrawRevokeShareLink,
          }}
        />

        <AppSidebar
          currentDrawingStatus={kindrawDrawingStatus}
          currentItem={kindrawCurrentItem}
          drawingSaveState={kindrawDrawingSaveState}
          errorMessage={errorMessage}
          isMutating={kindrawBusy}
          onAssignTag={handleKindrawAssignTag}
          onArchiveItem={handleKindrawArchiveItem}
          onCreateItem={handleKindrawCreateItem}
          onCreateTag={(name) => handleKindrawCreateFolder(null, name)}
          onDeleteItem={handleKindrawDeleteItem}
          onLogout={handleKindrawLogout}
          route={kindrawRoute}
          session={kindrawSession}
          tree={kindrawTree}
        />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.liveCollaboration"),
              category: DEFAULT_CATEGORIES.app,
              keywords: [
                "team",
                "multiplayer",
                "share",
                "public",
                "session",
                "invite",
              ],
              icon: usersIcon,
              perform: () => {
                handleRealtimeAction();
              },
            },
            {
              label: t("roomDialog.button_stopSession"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!collabAPI?.isCollaborating(),
              keywords: [
                "stop",
                "session",
                "end",
                "leave",
                "close",
                "exit",
                "collaboration",
              ],
              perform: () => {
                if (collabAPI) {
                  collabAPI.stopCollaboration();
                  if (!collabAPI.isCollaborating()) {
                    setShareDialogState({ isOpen: false });
                  }
                }
              },
            },
            {
              label: t("kindraw.commandPalette.publicLink"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () =>
                kindrawRoute.kind === "drawing" && !!kindrawCurrentItem,
              icon: LinkIcon,
              keywords: [
                "link",
                "readonly",
                "publish",
                "url",
                "public",
                "share",
              ],
              perform: async () => {
                await handleKindrawPrimaryShareAction();
              },
            },
            {
              label: t("kindraw.commandPalette.github"),
              icon: GithubIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: [
                "issues",
                "bugs",
                "requests",
                "report",
                "features",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://github.com/MatheusKindrazki/kindraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("kindraw.commandPalette.homepage"),
              icon: LinkIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["website", "homepage", "docs", "product", "kindraw"],
              perform: () => {
                window.open(
                  "https://kindraw.dev",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
