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
  createFolder,
  createItem,
  createShareLink,
  buildPublicShareUrl,
  getItem,
  getSession,
  getTree,
  logout as logoutKindraw,
  openGithubLogin,
  revokeShareLink,
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
import { getKindrawDraft, setKindrawDraft } from "./kindraw/storage";
import { getErrorMessage, isDraftNewer } from "./kindraw/utils";

import type { CollabAPI } from "./collab/Collab";
import type {
  KindrawItem,
  KindrawItemKind,
  KindrawSession,
  KindrawTreeResponse,
} from "./kindraw/types";

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

const formatCollaboratorSummary = (appState: UIAppState) => {
  const names = Array.from(
    new Set(
      Array.from(appState.collaborators.values())
        .filter((collaborator) => !collaborator.isCurrentUser)
        .map((collaborator) => collaborator.username?.trim() || "")
        .filter(Boolean),
    ),
  );

  if (!names.length) {
    return null;
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} e ${names[1]}`;
  }

  return `${names[0]}, ${names[1]} +${names.length - 2}`;
};

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
  const [kindrawDrawingStatus, setKindrawDrawingStatus] = useState<
    string | null
  >(null);
  const [kindrawDrawingSaveState, setKindrawDrawingSaveState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const kindrawApplyingSceneRef = useRef(false);
  const kindrawAutoCreateRootRef = useRef(false);
  const kindrawLastSavedContentRef = useRef<string | null>(null);
  const kindrawSaveTimeoutRef = useRef<number | null>(null);

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
    if (!collabAPI || !kindrawSession?.user) {
      return;
    }

    collabAPI.setUserProfile({
      userId: kindrawSession.user.id,
      username: getKindrawUserDisplayName(kindrawSession.user),
      avatarUrl: kindrawSession.user.avatarUrl,
      githubLogin: kindrawSession.user.githubLogin,
    });
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
        return;
      }

      await runKindrawMutation(async () => {
        await createFolder(nextName, parentId);
        await refreshKindrawTree();
      });
    },
    [refreshKindrawTree, runKindrawMutation],
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
      const nextTitle = title.trim();
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
                      shareLinks: [],
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
    void handleKindrawCreateItem("drawing", null, t("labels.untitled"), {
      replace: true,
    });
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
      kindrawLastSavedContentRef.current = null;
      return;
    }

    if (!kindrawSession || !excalidrawAPI) {
      return;
    }

    let cancelled = false;

    const loadKindrawDrawing = async () => {
      try {
        const response = await getItem(kindrawRoute.itemId);
        const draft = await getKindrawDraft(kindrawRoute.itemId);
        const restoredContent =
          draft && isDraftNewer(draft.updatedAt, response.item.updatedAt)
            ? draft.content
            : response.content;
        const scene = parseDrawingContent(restoredContent);

        if (cancelled) {
          return;
        }

        kindrawApplyingSceneRef.current = true;
        kindrawLastSavedContentRef.current = response.content;
        startTransition(() => {
          setKindrawCurrentItem(response.item);
          setKindrawDrawingSaveState("idle");
          setKindrawDrawingStatus(
            draft && isDraftNewer(draft.updatedAt, response.item.updatedAt)
              ? t("kindraw.status.draftRestored")
              : t("kindraw.status.drawingSynced"),
          );
        });

        excalidrawAPI.updateScene({
          elements: restoreElements(scene.elements, null, {
            repairBindings: true,
          }),
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

        window.setTimeout(() => {
          kindrawApplyingSceneRef.current = false;
        }, 0);
      } catch (error) {
        if (!cancelled) {
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
  }, [excalidrawAPI, kindrawRoute, kindrawSession]);

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

  const handleStartRealtimeCollab = useCallback(() => {
    if (!collabAPI) {
      return;
    }

    trackEvent("share", "room creation", `ui (${getFrame()})`);
    void collabAPI.startCollaboration(null);
  }, [collabAPI]);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  const handleRealtimeAction = useCallback(() => {
    if (isCollaborating) {
      onCollabDialogOpen();
      return;
    }

    handleStartRealtimeCollab();
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
        renderTopRightUI={(isMobile, appState) => {
          if (isMobile || !collabAPI || isCollabDisabled) {
            return null;
          }

          const isDrawingRoute = kindrawRoute.kind === "drawing";
          const shouldShowRealtimeAction = isDrawingRoute || isCollaborating;
          const activeShareLink = kindrawCurrentItem?.shareLinks[0] || null;
          const collaboratorSummary = formatCollaboratorSummary(appState);

          return (
            <div className="excalidraw-ui-top-right kindraw-top-right-actions">
              {collabError.message && <CollabError collabError={collabError} />}
              {kindrawSession ? (
                <button
                  className="kindraw-top-right-actions__button"
                  onClick={() =>
                    setAppState({
                      openSidebar: { name: "kindraw" },
                      openMenu: null,
                      openPopup: null,
                      openDialog: null,
                    })
                  }
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
                  <span>{getKindrawUserDisplayName(kindrawSession.user)}</span>
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
              {collaboratorSummary ? (
                <div
                  className="kindraw-top-right-actions__presence"
                  title={t("kindraw.presence.activeWith", {
                    names: collaboratorSummary,
                  })}
                >
                  {usersIcon}
                  <span>{collaboratorSummary}</span>
                </div>
              ) : null}
              {isDrawingRoute && kindrawCurrentItem ? (
                <button
                  className="kindraw-top-right-actions__button"
                  onClick={() => void handleKindrawPrimaryShareAction()}
                  type="button"
                >
                  {LinkIcon}
                  <span>
                    {activeShareLink
                      ? t("kindraw.actions.copyPublicLink")
                      : t("kindraw.actions.createPublicLink")}
                  </span>
                </button>
              ) : null}
              {shouldShowRealtimeAction ? (
                <button
                  className={`kindraw-top-right-actions__button${
                    isCollaborating
                      ? " kindraw-top-right-actions__button--active"
                      : ""
                  }`}
                  onClick={handleRealtimeAction}
                  type="button"
                >
                  {usersIcon}
                  <span>
                    {isCollaborating
                      ? t("kindraw.actions.manageRealtime")
                      : t("kindraw.actions.startRealtime")}
                  </span>
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
        <AppMainMenu />
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
          onCreateFolder={handleKindrawCreateFolder}
          onCreateItem={handleKindrawCreateItem}
          onCreateShareLink={handleKindrawCreateShareLink}
          onLogout={handleKindrawLogout}
          onRevokeShareLink={handleKindrawRevokeShareLink}
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
