import { useEffect, useRef, useState } from "react";

import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import {
  actionLoadScene,
  actionShortcuts,
} from "@excalidraw/excalidraw/actions";
import { activeConfirmDialogAtom } from "@excalidraw/excalidraw/components/ActiveConfirmDialog";
import {
  useEditorInterface,
  useExcalidrawActionManager,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import {
  ExportImageIcon,
  LibraryIcon,
  LoadIcon,
  PlusIcon,
  TextIcon,
  chevronLeftIcon,
  chevronRight,
  file,
  palette,
  usersIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useSetAtom } from "@excalidraw/excalidraw/editor-jotai";

import { ShareLinksPanel } from "../kindraw/ShareLinksPanel";
import {
  buildFolderPath,
  buildItemPath,
  navigateKindraw,
} from "../kindraw/router";
import {
  getFolderChildren,
  getFolderTrail,
  resolveRouteFolderId,
} from "../kindraw/tree";
import { openGithubLogin } from "../kindraw/api";

import "./AppSidebar.scss";

import type { KindrawRoute } from "../kindraw/router";
import type {
  KindrawFolder,
  KindrawItem,
  KindrawItemKind,
  KindrawSession,
  KindrawTreeResponse,
} from "../kindraw/types";

type AppSidebarProps = {
  currentDrawingStatus?: string | null;
  currentItem: KindrawItem | null;
  drawingSaveState?: "idle" | "saving" | "error";
  errorMessage?: string | null;
  isMutating?: boolean;
  onCreateFolder: (
    parentId: string | null,
    name: string,
  ) => Promise<void> | void;
  onCreateItem: (
    kind: KindrawItemKind,
    folderId: string | null,
    title: string,
  ) => Promise<void> | void;
  onCreateShareLink: () => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  route: KindrawRoute;
  session: KindrawSession | null | undefined;
  tree: KindrawTreeResponse | null;
};

type ComposerMode = "drawing" | "folder";

const getComposerDefaults = (
  mode: ComposerMode,
  currentFolderName: string | null,
  translate: ReturnType<typeof useI18n>["t"],
) => {
  if (mode === "folder") {
    return {
      label: currentFolderName
        ? translate("kindraw.sidebar.newFolderInFolderLabel", {
            name: currentFolderName,
          })
        : translate("kindraw.sidebar.newFolderInRootLabel"),
      helper: currentFolderName
        ? translate("kindraw.sidebar.newFolderInFolderHelper")
        : translate("kindraw.sidebar.newFolderInRootHelper"),
      submitLabel: translate("kindraw.sidebar.createFolderSubmit"),
      value: translate("kindraw.sidebar.newFolderDefault"),
    };
  }

  return {
    label: currentFolderName
      ? translate("kindraw.sidebar.newDrawingInFolderLabel", {
          name: currentFolderName,
        })
      : translate("kindraw.sidebar.newDrawingInRootLabel"),
    helper: translate("kindraw.sidebar.newDrawingHelper"),
    submitLabel: translate("kindraw.sidebar.createDrawingSubmit"),
    value: translate("kindraw.sidebar.newDrawingDefault"),
  };
};

const getItemKindLabel = (
  kind: KindrawItemKind,
  translate: ReturnType<typeof useI18n>["t"],
) =>
  kind === "drawing"
    ? translate("kindraw.sidebar.drawingKind")
    : translate("kindraw.sidebar.docKind");

const getInitials = (name: string) => {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() || "")
    .join("");
};

const EditorActions = () => {
  const { t } = useI18n();
  const actionManager = useExcalidrawActionManager();
  const setAppState = useExcalidrawSetAppState();
  const setActiveConfirmDialog = useSetAtom(activeConfirmDialogAtom);

  return (
    <section className="kindraw-app-sidebar__section">
      <div className="kindraw-app-sidebar__section-head">
        <div className="kindraw-app-sidebar__section-title">
          <span className="kindraw-app-sidebar__section-icon">{palette}</span>
          <h3>{t("kindraw.sidebar.editor")}</h3>
        </div>
      </div>

      <div className="kindraw-app-sidebar__tools-grid">
        {actionManager.isActionEnabled(actionLoadScene) ? (
          <button
            className="kindraw-app-sidebar__tool-button"
            onClick={() => actionManager.executeAction(actionLoadScene)}
            type="button"
          >
            <span className="kindraw-app-sidebar__tool-icon">{LoadIcon}</span>
            <span>{t("kindraw.actions.importFile")}</span>
          </button>
        ) : null}

        <button
          className="kindraw-app-sidebar__tool-button"
          onClick={() => setAppState({ openDialog: { name: "imageExport" } })}
          type="button"
        >
          <span className="kindraw-app-sidebar__tool-icon">
            {ExportImageIcon}
          </span>
          <span>{t("kindraw.actions.exportImage")}</span>
        </button>

        <button
          className="kindraw-app-sidebar__tool-button"
          onClick={() =>
            setAppState({ openDialog: { name: "commandPalette" } })
          }
          type="button"
        >
          <span className="kindraw-app-sidebar__tool-icon">{palette}</span>
          <span>{t("kindraw.actions.commands")}</span>
        </button>

        <button
          className="kindraw-app-sidebar__tool-button"
          onClick={() => actionManager.executeAction(actionShortcuts)}
          type="button"
        >
          <span className="kindraw-app-sidebar__tool-icon">{usersIcon}</span>
          <span>{t("kindraw.actions.shortcuts")}</span>
        </button>
      </div>

      <button
        className="kindraw-app-sidebar__link kindraw-app-sidebar__link--muted"
        onClick={() => setActiveConfirmDialog("clearCanvas")}
        type="button"
      >
        {t("kindraw.actions.clearCanvas")}
      </button>
    </section>
  );
};

const FolderTree = ({
  currentFolderId,
  folders,
  parentId,
}: {
  currentFolderId: string | null;
  folders: KindrawFolder[];
  parentId: string | null;
}) => {
  const children = getFolderChildren(folders, parentId);
  if (!children.length) {
    return null;
  }

  return (
    <ul className="kindraw-app-sidebar__tree">
      {children.map((folder) => (
        <li className="kindraw-app-sidebar__tree-node" key={folder.id}>
          <button
            className={`kindraw-app-sidebar__tree-button${
              currentFolderId === folder.id
                ? " kindraw-app-sidebar__tree-button--active"
                : ""
            }`}
            onClick={() => navigateKindraw(buildFolderPath(folder.id))}
            type="button"
          >
            <span className="kindraw-app-sidebar__tree-entry">
              <span className="kindraw-app-sidebar__tree-icon">
                {LibraryIcon}
              </span>
              <span className="kindraw-app-sidebar__tree-label">
                {folder.name}
              </span>
            </span>
          </button>
          <FolderTree
            currentFolderId={currentFolderId}
            folders={folders}
            parentId={folder.id}
          />
        </li>
      ))}
    </ul>
  );
};

export const AppSidebar = ({
  currentDrawingStatus,
  currentItem,
  drawingSaveState,
  errorMessage,
  isMutating,
  onCreateFolder,
  onCreateItem,
  onCreateShareLink,
  onLogout,
  onRevokeShareLink,
  route,
  session,
  tree,
}: AppSidebarProps) => {
  const { t } = useI18n();
  const { openSidebar } = useUIAppState();
  const editorInterface = useEditorInterface();
  const setAppState = useExcalidrawSetAppState();
  const didAutoOpenRef = useRef(false);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode | null>(null);
  const [composerValue, setComposerValue] = useState("");

  const currentFolderId = tree
    ? resolveRouteFolderId(route, currentItem)
    : null;
  const currentFolder =
    tree?.folders.find((folder) => folder.id === currentFolderId) || null;

  useEffect(() => {
    if (
      didAutoOpenRef.current ||
      !editorInterface.canFitSidebar ||
      route.kind === "public" ||
      route.kind === "share" ||
      openSidebar
    ) {
      return;
    }

    didAutoOpenRef.current = true;
    setAppState({
      openSidebar: { name: "kindraw" },
      openMenu: null,
      openPopup: null,
      openDialog: null,
    });
  }, [editorInterface.canFitSidebar, openSidebar, route.kind, setAppState]);

  useEffect(() => {
    const root = document.querySelector(".excalidraw");
    const isDockedLeft =
      openSidebar?.name === "kindraw" && editorInterface.canFitSidebar;

    root?.classList.toggle("kindraw-sidebar-open-left", isDockedLeft);

    return () => {
      root?.classList.remove("kindraw-sidebar-open-left");
    };
  }, [editorInterface.canFitSidebar, openSidebar?.name]);

  useEffect(() => {
    if (!composerMode) {
      return;
    }

    composerInputRef.current?.focus();
    composerInputRef.current?.select();
  }, [composerMode]);

  useEffect(() => {
    setComposerMode(null);
    setComposerValue("");
  }, [currentFolderId]);

  const openComposer = (mode: ComposerMode) => {
    const defaults = getComposerDefaults(mode, currentFolder?.name || null, t);
    setComposerMode(mode);
    setComposerValue(defaults.value);
  };

  const closeComposer = () => {
    setComposerMode(null);
    setComposerValue("");
  };

  return (
    <>
      <DefaultSidebar className="kindraw-app-sidebar__fallback-suppress" />
      <Sidebar
        className="kindraw-app-sidebar-root"
        docked={editorInterface.canFitSidebar}
        name="kindraw"
      >
        <Sidebar.Header className="kindraw-app-sidebar__shell-header">
          <strong className="kindraw-app-sidebar__shell-title">Kindraw</strong>
        </Sidebar.Header>

        {typeof session === "undefined" ? (
          <div className="kindraw-app-sidebar__panel">
            <p>{t("kindraw.sidebar.loadingWorkspace")}</p>
          </div>
        ) : !session ? (
          <div className="kindraw-app-sidebar__panel">
            <section className="kindraw-app-sidebar__overview">
              <div className="kindraw-app-sidebar__overview-icon">
                {LibraryIcon}
              </div>
              <div className="kindraw-app-sidebar__overview-copy">
                <span className="kindraw-app-sidebar__eyebrow">
                  {t("kindraw.sidebar.workspace")}
                </span>
                <h2>{t("kindraw.sidebar.guestTitle")}</h2>
                <p>{t("kindraw.sidebar.guestDescription")}</p>
              </div>
            </section>
            <button
              className="kindraw-app-sidebar__button kindraw-app-sidebar__button--primary"
              onClick={openGithubLogin}
              type="button"
            >
              {t("kindraw.actions.signInWithGitHub")}
            </button>
          </div>
        ) : !tree ? (
          <div className="kindraw-app-sidebar__panel">
            <p>{t("kindraw.sidebar.loadingWorkspaceTree")}</p>
          </div>
        ) : (
          (() => {
            const folderTrail = getFolderTrail(tree.folders, currentFolderId);
            const visibleItems = tree.items
              .filter((item) => item.folderId === currentFolderId)
              .sort((a, b) => {
                if (a.kind !== b.kind) {
                  return a.kind === "drawing" ? -1 : 1;
                }
                return a.title.localeCompare(b.title);
              });
            const composerConfig = composerMode
              ? getComposerDefaults(
                  composerMode,
                  currentFolder?.name || null,
                  t,
                )
              : null;

            return (
              <div className="kindraw-app-sidebar__panel">
                <header className="kindraw-app-sidebar__profile">
                  <div className="kindraw-app-sidebar__profile-main">
                    <div className="kindraw-app-sidebar__avatar">
                      {session.user.avatarUrl ? (
                        <img
                          alt={session.user.name}
                          src={session.user.avatarUrl}
                        />
                      ) : (
                        <span>{getInitials(session.user.name)}</span>
                      )}
                    </div>
                    <div className="kindraw-app-sidebar__profile-copy">
                      <strong>{session.user.name}</strong>
                      <span>@{session.user.githubLogin}</span>
                    </div>
                  </div>
                  <button
                    className="kindraw-app-sidebar__link"
                    disabled={isMutating}
                    onClick={() => void onLogout()}
                    type="button"
                  >
                    {t("kindraw.actions.signOut")}
                  </button>
                </header>

                <section className="kindraw-app-sidebar__overview">
                  <div className="kindraw-app-sidebar__overview-icon">
                    {LibraryIcon}
                  </div>
                  <div className="kindraw-app-sidebar__overview-copy">
                    <span className="kindraw-app-sidebar__eyebrow">
                      {currentFolder
                        ? t("kindraw.sidebar.currentFolder")
                        : t("kindraw.sidebar.workspaceRoot")}
                    </span>
                    <h2>
                      {currentFolder?.name ||
                        t("kindraw.sidebar.workspaceTitle")}
                    </h2>
                    <p>
                      {currentFolder
                        ? t("kindraw.sidebar.currentFolderDescription")
                        : t("kindraw.sidebar.workspaceDescription")}
                    </p>
                  </div>
                </section>

                {route.kind === "drawing" && currentItem ? (
                  <section className="kindraw-app-sidebar__section kindraw-app-sidebar__section--current">
                    <div className="kindraw-app-sidebar__section-head kindraw-app-sidebar__section-head--stacked">
                      <div className="kindraw-app-sidebar__section-title">
                        <span className="kindraw-app-sidebar__section-icon">
                          {file}
                        </span>
                        <div>
                          <span className="kindraw-app-sidebar__eyebrow">
                            {t("kindraw.sidebar.openFile")}
                          </span>
                          <h3>{currentItem.title}</h3>
                        </div>
                      </div>
                      {currentDrawingStatus ? (
                        <span
                          className={`kindraw-app-sidebar__status kindraw-app-sidebar__status--${
                            drawingSaveState || "idle"
                          }`}
                        >
                          {currentDrawingStatus}
                        </span>
                      ) : null}
                    </div>
                    <p className="kindraw-app-sidebar__helper">
                      {t("kindraw.sidebar.openFileDescription")}
                    </p>
                    <button
                      className="kindraw-app-sidebar__back-button"
                      onClick={() =>
                        navigateKindraw(buildFolderPath(currentItem.folderId))
                      }
                      type="button"
                    >
                      {chevronLeftIcon}
                      <span>
                        {t("kindraw.actions.backToWorkspace", {
                          name:
                            currentFolder?.name ||
                            t("kindraw.sidebar.workspaceRoot").toLowerCase(),
                        })}
                      </span>
                    </button>
                    <ShareLinksPanel
                      busy={isMutating || drawingSaveState === "saving"}
                      onCreateShareLink={onCreateShareLink}
                      onRevokeShareLink={onRevokeShareLink}
                      shareLinks={currentItem.shareLinks}
                    />
                  </section>
                ) : null}

                <div className="kindraw-app-sidebar__breadcrumbs">
                  <button
                    className={`kindraw-app-sidebar__breadcrumb${
                      !currentFolderId
                        ? " kindraw-app-sidebar__breadcrumb--active"
                        : ""
                    }`}
                    onClick={() => navigateKindraw("/")}
                    type="button"
                  >
                    {t("kindraw.sidebar.root")}
                  </button>
                  {folderTrail.map((folder) => (
                    <div
                      className="kindraw-app-sidebar__breadcrumb-group"
                      key={folder.id}
                    >
                      <span className="kindraw-app-sidebar__breadcrumb-separator">
                        {chevronRight}
                      </span>
                      <button
                        className={`kindraw-app-sidebar__breadcrumb${
                          currentFolderId === folder.id
                            ? " kindraw-app-sidebar__breadcrumb--active"
                            : ""
                        }`}
                        onClick={() =>
                          navigateKindraw(buildFolderPath(folder.id))
                        }
                        type="button"
                      >
                        {folder.name}
                      </button>
                    </div>
                  ))}
                </div>

                <section className="kindraw-app-sidebar__section">
                  <div className="kindraw-app-sidebar__section-head">
                    <div className="kindraw-app-sidebar__section-title">
                      <span className="kindraw-app-sidebar__section-icon">
                        {LibraryIcon}
                      </span>
                      <h3>{t("kindraw.sidebar.folders")}</h3>
                    </div>
                    <div className="kindraw-app-sidebar__section-meta">
                      <span className="kindraw-app-sidebar__section-count">
                        {tree.folders.length}
                      </span>
                      <button
                        aria-label={
                          currentFolder
                            ? t("kindraw.sidebar.createSubfolderAria", {
                                name: currentFolder.name,
                              })
                            : t("kindraw.sidebar.createFolderAria")
                        }
                        className="kindraw-app-sidebar__section-action"
                        disabled={isMutating}
                        onClick={() => openComposer("folder")}
                        type="button"
                      >
                        {PlusIcon}
                      </button>
                    </div>
                  </div>

                  {composerMode === "folder" && composerConfig ? (
                    <form
                      className="kindraw-app-sidebar__composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = composerValue.trim();
                        if (!value) {
                          return;
                        }

                        void Promise.resolve(
                          onCreateFolder(currentFolderId, value),
                        ).then(closeComposer);
                      }}
                    >
                      <label className="kindraw-app-sidebar__field">
                        <span>{composerConfig.label}</span>
                        <input
                          className="kindraw-app-sidebar__input"
                          disabled={isMutating}
                          onChange={(event) =>
                            setComposerValue(event.target.value)
                          }
                          ref={composerInputRef}
                          type="text"
                          value={composerValue}
                        />
                      </label>
                      <p className="kindraw-app-sidebar__helper">
                        {composerConfig.helper}
                      </p>
                      <div className="kindraw-app-sidebar__composer-actions">
                        <button
                          className="kindraw-app-sidebar__button kindraw-app-sidebar__button--primary"
                          disabled={isMutating || !composerValue.trim()}
                          type="submit"
                        >
                          {composerConfig.submitLabel}
                        </button>
                        <button
                          className="kindraw-app-sidebar__button kindraw-app-sidebar__button--ghost"
                          onClick={closeComposer}
                          type="button"
                        >
                          {t("buttons.cancel")}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <button
                    className={`kindraw-app-sidebar__tree-button${
                      route.kind === "workspace" && route.folderId === null
                        ? " kindraw-app-sidebar__tree-button--active"
                        : ""
                    }`}
                    onClick={() => navigateKindraw("/")}
                    type="button"
                  >
                    <span className="kindraw-app-sidebar__tree-entry">
                      <span className="kindraw-app-sidebar__tree-icon">
                        {LibraryIcon}
                      </span>
                      <span className="kindraw-app-sidebar__tree-label">
                        {t("kindraw.sidebar.library")}
                      </span>
                    </span>
                  </button>

                  <FolderTree
                    currentFolderId={currentFolderId}
                    folders={tree.folders}
                    parentId={null}
                  />
                </section>

                <section className="kindraw-app-sidebar__section">
                  <div className="kindraw-app-sidebar__section-head">
                    <div className="kindraw-app-sidebar__section-title">
                      <span className="kindraw-app-sidebar__section-icon">
                        {file}
                      </span>
                      <h3>{t("kindraw.sidebar.files")}</h3>
                    </div>
                    <div className="kindraw-app-sidebar__section-meta">
                      <span className="kindraw-app-sidebar__section-count">
                        {visibleItems.length}
                      </span>
                      <button
                        aria-label={
                          currentFolder
                            ? t("kindraw.sidebar.createDrawingInFolderAria", {
                                name: currentFolder.name,
                              })
                            : t("kindraw.sidebar.createDrawingAria")
                        }
                        className="kindraw-app-sidebar__section-action"
                        disabled={isMutating}
                        onClick={() => openComposer("drawing")}
                        type="button"
                      >
                        {PlusIcon}
                      </button>
                    </div>
                  </div>

                  {composerMode === "drawing" && composerConfig ? (
                    <form
                      className="kindraw-app-sidebar__composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = composerValue.trim();
                        if (!value) {
                          return;
                        }

                        void Promise.resolve(
                          onCreateItem("drawing", currentFolderId, value),
                        ).then(closeComposer);
                      }}
                    >
                      <label className="kindraw-app-sidebar__field">
                        <span>{composerConfig.label}</span>
                        <input
                          className="kindraw-app-sidebar__input"
                          disabled={isMutating}
                          onChange={(event) =>
                            setComposerValue(event.target.value)
                          }
                          ref={composerInputRef}
                          type="text"
                          value={composerValue}
                        />
                      </label>
                      <p className="kindraw-app-sidebar__helper">
                        {composerConfig.helper}
                      </p>
                      <div className="kindraw-app-sidebar__composer-actions">
                        <button
                          className="kindraw-app-sidebar__button kindraw-app-sidebar__button--primary"
                          disabled={isMutating || !composerValue.trim()}
                          type="submit"
                        >
                          {composerConfig.submitLabel}
                        </button>
                        <button
                          className="kindraw-app-sidebar__button kindraw-app-sidebar__button--ghost"
                          onClick={closeComposer}
                          type="button"
                        >
                          {t("buttons.cancel")}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {visibleItems.length ? (
                    <ul className="kindraw-app-sidebar__items">
                      {visibleItems.map((item) => (
                        <li
                          className="kindraw-app-sidebar__item-card"
                          key={item.id}
                        >
                          <button
                            className={`kindraw-app-sidebar__item${
                              currentItem?.id === item.id
                                ? " kindraw-app-sidebar__item--active"
                                : ""
                            }`}
                            onClick={() => navigateKindraw(buildItemPath(item))}
                            type="button"
                          >
                            <span className="kindraw-app-sidebar__item-main">
                              <span className="kindraw-app-sidebar__item-icon">
                                {item.kind === "drawing" ? file : TextIcon}
                              </span>
                              <span className="kindraw-app-sidebar__item-title">
                                {item.title}
                              </span>
                            </span>
                            <small>{getItemKindLabel(item.kind, t)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="kindraw-app-sidebar__empty">
                      {t("kindraw.sidebar.noFilesInFolder")}
                    </p>
                  )}
                </section>

                <EditorActions />

                {errorMessage ? (
                  <p className="kindraw-app-sidebar__error">{errorMessage}</p>
                ) : null}
              </div>
            );
          })()
        )}
      </Sidebar>
    </>
  );
};
