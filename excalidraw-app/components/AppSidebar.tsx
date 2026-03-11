import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import DropdownMenu from "@excalidraw/excalidraw/components/dropdownMenu/DropdownMenu";
import { ExcalidrawLogo } from "@excalidraw/excalidraw/components/ExcalidrawLogo";
import {
  useEditorInterface,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import {
  DotsHorizontalIcon,
  LibraryIcon,
  PlusIcon,
  archiveIcon,
  checkIcon,
  chevronRight,
  emptyIcon,
  file,
  gridIcon,
  historyIcon,
  trashIcon,
  usersIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { openGithubLogin } from "../kindraw/api";
import { generateKindrawCanvasTitle } from "../kindraw/naming";
import { buildItemPath, navigateKindraw } from "../kindraw/router";

import "./AppSidebar.scss";

import type { KindrawRoute } from "../kindraw/router";
import type {
  KindrawFolder,
  KindrawItem,
  KindrawItemKind,
  KindrawSession,
  KindrawTreeResponse,
} from "../kindraw/types";

type CreateTagHandler = (
  name: string,
) => Promise<string | null | void> | string | null | void;

type AppSidebarProps = {
  currentDrawingStatus?: string | null;
  currentItem: KindrawItem | null;
  drawingSaveState?: "idle" | "saving" | "error";
  errorMessage?: string | null;
  isMutating?: boolean;
  onAssignTag: (itemId: string, tagId: string | null) => Promise<void> | void;
  onArchiveItem: (itemId: string, archived: boolean) => Promise<void> | void;
  onCreateItem: (
    kind: KindrawItemKind,
    folderId: string | null,
    title: string,
  ) => Promise<void> | void;
  onCreateTag: CreateTagHandler;
  onDeleteItem: (itemId: string) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  route: KindrawRoute;
  session: KindrawSession | null | undefined;
  tree: KindrawTreeResponse | null;
};

type ComposerMode = "drawing" | "tag";
type SidebarView = "all" | "recent" | "shared" | "archived";

const TAG_FILTER_ALL = "__all__";
const TAG_FILTER_UNTAGGED = "__untagged__";
const RECENT_DRAWINGS_LIMIT = 6;
const TAG_SWATCHES = [
  "#5B8DEF",
  "#F5B53D",
  "#29C182",
  "#8B5CF6",
  "#F472B6",
  "#14B8A6",
];

const getComposerDefaults = (
  mode: ComposerMode,
  selectedTagName: string | null,
  translate: ReturnType<typeof useI18n>["t"],
) => {
  if (mode === "tag") {
    return {
      placeholder: translate("kindraw.sidebar.newTagPlaceholder"),
      submitLabel: translate("kindraw.sidebar.createTagSubmit"),
      value: "",
    };
  }

  return {
    placeholder: selectedTagName
      ? translate("kindraw.sidebar.newCanvasTaggedPlaceholder", {
          name: selectedTagName,
        })
      : translate("kindraw.sidebar.newCanvasPlaceholder"),
    submitLabel: translate("kindraw.sidebar.createCanvasSubmit"),
    value: generateKindrawCanvasTitle({
      tagName: selectedTagName,
    }),
  };
};

const getInitials = (name: string) => {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() || "")
    .join("");
};

const formatCanvasUpdatedAt = (updatedAt: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(new Date(updatedAt));
  } catch {
    return updatedAt;
  }
};

const hashToken = (token: string) =>
  [...token].reduce((acc, char) => acc * 33 + char.charCodeAt(0), 17);

const getTagColor = (token: string) =>
  TAG_SWATCHES[Math.abs(hashToken(token)) % TAG_SWATCHES.length];

const isSharedCanvas = (item: KindrawItem) =>
  item.shareLinks.some((link) => !link.revokedAt) ||
  Boolean(item.collaborationRoomId);

const getCanvasSectionLabel = (
  view: SidebarView,
  translate: ReturnType<typeof useI18n>["t"],
) => {
  switch (view) {
    case "archived":
      return translate("kindraw.sidebar.archivedCanvases");
    case "recent":
      return translate("kindraw.sidebar.recentDrawings");
    case "shared":
      return translate("kindraw.sidebar.sharedCanvases");
    default:
      return translate("kindraw.sidebar.allCanvases");
  }
};

const getEmptyStateLabel = (
  view: SidebarView,
  translate: ReturnType<typeof useI18n>["t"],
) => {
  switch (view) {
    case "archived":
      return translate("kindraw.sidebar.noArchivedCanvases");
    case "shared":
      return translate("kindraw.sidebar.noSharedCanvases");
    default:
      return translate("kindraw.sidebar.noCanvases");
  }
};

const CanvasTagMenu = ({
  currentTagId,
  disabled,
  itemId,
  onAssignTag,
  onCreateTag,
  tags,
}: {
  currentTagId: string | null;
  disabled?: boolean;
  itemId: string;
  onAssignTag: (itemId: string, tagId: string | null) => Promise<void> | void;
  onCreateTag: CreateTagHandler;
  tags: KindrawFolder[];
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const currentTag = tags.find((tag) => tag.id === currentTagId) || null;
  const currentColor = currentTag ? getTagColor(currentTag.id) : "#C0C7D4";
  const triggerStyle = {
    "--kindraw-tag-accent": currentColor,
  } as CSSProperties;

  useEffect(() => {
    if (!isOpen) {
      setDraft("");
    }
  }, [isOpen]);

  const assignTag = async (tagId: string | null) => {
    setIsOpen(false);
    setDraft("");
    await onAssignTag(itemId, tagId);
  };

  const handleCreateTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const value = draft.trim();
    if (!value) {
      return;
    }

    const createdTagId = await onCreateTag(value);
    if (typeof createdTagId === "string") {
      await onAssignTag(itemId, createdTagId);
    }

    setIsOpen(false);
    setDraft("");
  };

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenu.Trigger
        aria-label={t("kindraw.sidebar.tagMenuAria")}
        className="kindraw-app-sidebar__tag-dropdown-trigger"
        data-open={isOpen ? "true" : "false"}
        disabled={disabled}
        onToggle={() => setIsOpen((current) => !current)}
      >
        <span
          className={`kindraw-app-sidebar__tag-pill${
            currentTag ? "" : " kindraw-app-sidebar__tag-pill--muted"
          }`}
          style={triggerStyle}
        >
          <span className="kindraw-app-sidebar__tag-pill-dot" />
          <span className="kindraw-app-sidebar__tag-pill-label">
            {currentTag?.name || t("kindraw.sidebar.noTag")}
          </span>
        </span>
        <span className="kindraw-app-sidebar__tag-dropdown-caret">
          {chevronRight}
        </span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="end"
        className="kindraw-app-sidebar__tag-dropdown"
        onClickOutside={() => setIsOpen(false)}
      >
        <DropdownMenu.Item
          icon={!currentTagId ? checkIcon : emptyIcon}
          onSelect={() => {
            void assignTag(null);
          }}
          selected={!currentTagId}
        >
          {t("kindraw.sidebar.noTag")}
        </DropdownMenu.Item>

        {tags.length ? <DropdownMenu.Separator /> : null}

        {tags.map((tag) => (
          <DropdownMenu.Item
            icon={tag.id === currentTagId ? checkIcon : emptyIcon}
            key={tag.id}
            onSelect={() => {
              void assignTag(tag.id);
            }}
            selected={tag.id === currentTagId}
          >
            {tag.name}
          </DropdownMenu.Item>
        ))}

        <DropdownMenu.Separator />
        <DropdownMenu.ItemCustom
          className="kindraw-app-sidebar__tag-dropdown-custom"
          onClick={(event) => event.stopPropagation()}
        >
          <form
            className="kindraw-app-sidebar__tag-dropdown-form"
            onSubmit={(event) => {
              void handleCreateTag(event);
            }}
          >
            <input
              aria-label={t("kindraw.sidebar.newTagLabel")}
              className="kindraw-app-sidebar__tag-dropdown-input"
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder={t("kindraw.sidebar.newTagPlaceholder")}
              type="text"
              value={draft}
            />
            <button
              className="kindraw-app-sidebar__mini-action kindraw-app-sidebar__mini-action--solid"
              disabled={disabled || !draft.trim()}
              type="submit"
            >
              {PlusIcon}
            </button>
          </form>
        </DropdownMenu.ItemCustom>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

const CanvasActionsMenu = ({
  disabled,
  item,
  onArchiveItem,
  onDeleteItem,
}: {
  disabled?: boolean;
  item: KindrawItem;
  onArchiveItem: (itemId: string, archived: boolean) => Promise<void> | void;
  onDeleteItem: (itemId: string) => Promise<void> | void;
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenu.Trigger
        aria-label={t("kindraw.sidebar.canvasActionsAria")}
        className="kindraw-app-sidebar__canvas-actions-trigger"
        data-open={isOpen ? "true" : "false"}
        disabled={disabled}
        onToggle={() => setIsOpen((current) => !current)}
      >
        {DotsHorizontalIcon}
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="end"
        className="kindraw-app-sidebar__canvas-actions-dropdown"
        onClickOutside={() => setIsOpen(false)}
      >
        <DropdownMenu.Item
          icon={item.archivedAt ? historyIcon : archiveIcon}
          onSelect={() => {
            setIsOpen(false);
            void onArchiveItem(item.id, !item.archivedAt);
          }}
        >
          {item.archivedAt
            ? t("kindraw.sidebar.restoreCanvasAction")
            : t("kindraw.sidebar.archiveCanvasAction")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          className="kindraw-app-sidebar__canvas-actions-item--danger"
          icon={trashIcon}
          onSelect={() => {
            setIsOpen(false);
            void onDeleteItem(item.id);
          }}
        >
          {t("kindraw.sidebar.deleteCanvasAction")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

export const AppSidebar = ({
  currentDrawingStatus,
  currentItem,
  drawingSaveState,
  errorMessage,
  isMutating,
  onAssignTag,
  onArchiveItem,
  onCreateItem,
  onCreateTag,
  onDeleteItem,
  onLogout,
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
  const [selectedTagFilter, setSelectedTagFilter] =
    useState<string>(TAG_FILTER_ALL);
  const [selectedView, setSelectedView] = useState<SidebarView>("all");

  const tags = useMemo(
    () =>
      [...(tree?.folders || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [tree?.folders],
  );

  const selectedTag =
    selectedTagFilter !== TAG_FILTER_ALL &&
    selectedTagFilter !== TAG_FILTER_UNTAGGED
      ? tags.find((tag) => tag.id === selectedTagFilter) || null
      : null;

  const orderedCanvases = useMemo(() => {
    if (!tree) {
      return [];
    }

    return tree.items
      .filter((item) => item.kind === "drawing")
      .sort((a, b) => {
        if (a.id === currentItem?.id) {
          return -1;
        }
        if (b.id === currentItem?.id) {
          return 1;
        }

        const byUpdatedAt =
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

        if (byUpdatedAt !== 0) {
          return byUpdatedAt;
        }

        return a.title.localeCompare(b.title);
      });
  }, [currentItem?.id, tree]);

  const sharedCount = useMemo(
    () =>
      orderedCanvases.filter((item) => !item.archivedAt && isSharedCanvas(item))
        .length,
    [orderedCanvases],
  );

  const archivedCount = useMemo(
    () => orderedCanvases.filter((item) => Boolean(item.archivedAt)).length,
    [orderedCanvases],
  );

  const visibleCanvases = useMemo(() => {
    let canvases =
      selectedView === "archived"
        ? orderedCanvases.filter((item) => Boolean(item.archivedAt))
        : orderedCanvases.filter((item) => !item.archivedAt);

    if (selectedView === "recent") {
      canvases = canvases.slice(0, RECENT_DRAWINGS_LIMIT);
    } else if (selectedView === "shared") {
      canvases = canvases.filter(isSharedCanvas);
    }

    if (selectedTagFilter === TAG_FILTER_UNTAGGED) {
      return canvases.filter((item) => !item.folderId);
    }

    if (selectedTagFilter !== TAG_FILTER_ALL) {
      return canvases.filter((item) => item.folderId === selectedTagFilter);
    }

    return canvases;
  }, [orderedCanvases, selectedTagFilter, selectedView]);

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
  }, [selectedTagFilter, selectedView]);

  useEffect(() => {
    if (
      selectedTagFilter !== TAG_FILTER_ALL &&
      selectedTagFilter !== TAG_FILTER_UNTAGGED &&
      !tags.some((tag) => tag.id === selectedTagFilter)
    ) {
      setSelectedTagFilter(TAG_FILTER_ALL);
    }
  }, [selectedTagFilter, tags]);

  const openComposer = (mode: ComposerMode) => {
    const defaults = getComposerDefaults(mode, selectedTag?.name || null, t);
    setComposerMode((current) => (current === mode ? null : mode));
    setComposerValue(defaults.value);
  };

  const closeComposer = () => {
    setComposerMode(null);
    setComposerValue("");
  };

  const composerConfig = composerMode
    ? getComposerDefaults(composerMode, selectedTag?.name || null, t)
    : null;
  const canvasSectionLabel = getCanvasSectionLabel(selectedView, t);
  const emptyStateLabel = getEmptyStateLabel(selectedView, t);
  const menuItems = [
    {
      id: "all" as const,
      icon: gridIcon,
      label: t("kindraw.sidebar.allCanvases"),
      count: orderedCanvases.length,
    },
    {
      id: "recent" as const,
      icon: historyIcon,
      label: t("kindraw.sidebar.recent"),
      count: Math.min(orderedCanvases.length, RECENT_DRAWINGS_LIMIT),
    },
    {
      id: "shared" as const,
      icon: usersIcon,
      label: t("kindraw.sidebar.shared"),
      count: sharedCount,
    },
    {
      id: "archived" as const,
      icon: archiveIcon,
      label: t("kindraw.sidebar.archived"),
      count: archivedCount,
    },
  ];

  return (
    <>
      <DefaultSidebar className="kindraw-app-sidebar__fallback-suppress" />
      <Sidebar
        className="kindraw-app-sidebar-root"
        docked={editorInterface.canFitSidebar}
        name="kindraw"
      >
        <Sidebar.Header className="kindraw-app-sidebar__shell-header">
          <div className="kindraw-app-sidebar__brand">
            <ExcalidrawLogo size="xs" withText />
          </div>
        </Sidebar.Header>

        {typeof session === "undefined" ? (
          <div className="kindraw-app-sidebar__panel">
            <p className="kindraw-app-sidebar__empty">
              {t("kindraw.sidebar.loadingWorkspace")}
            </p>
          </div>
        ) : !session ? (
          <div className="kindraw-app-sidebar__panel">
            <section className="kindraw-app-sidebar__guest-card">
              <div className="kindraw-app-sidebar__guest-mark">
                {LibraryIcon}
              </div>
              <div className="kindraw-app-sidebar__guest-copy">
                <span className="kindraw-app-sidebar__section-label">
                  {t("kindraw.sidebar.workspace")}
                </span>
                <h2>{t("kindraw.sidebar.guestTitle")}</h2>
                <p>{t("kindraw.sidebar.guestDescription")}</p>
              </div>
              <button
                className="kindraw-app-sidebar__primary-button"
                onClick={openGithubLogin}
                type="button"
              >
                {t("kindraw.actions.signInWithGitHub")}
              </button>
            </section>
          </div>
        ) : !tree ? (
          <div className="kindraw-app-sidebar__panel">
            <p className="kindraw-app-sidebar__empty">
              {t("kindraw.sidebar.loadingWorkspaceTree")}
            </p>
          </div>
        ) : (
          <div className="kindraw-app-sidebar__panel">
            <header className="kindraw-app-sidebar__profile">
              <div className="kindraw-app-sidebar__profile-main">
                <div className="kindraw-app-sidebar__avatar">
                  {session.user.avatarUrl ? (
                    <img alt={session.user.name} src={session.user.avatarUrl} />
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
                className="kindraw-app-sidebar__text-link"
                disabled={isMutating}
                onClick={() => void onLogout()}
                type="button"
              >
                {t("kindraw.actions.signOut")}
              </button>
            </header>

            <section className="kindraw-app-sidebar__cta-section">
              <button
                className="kindraw-app-sidebar__primary-button"
                disabled={isMutating}
                onClick={() => openComposer("drawing")}
                type="button"
              >
                <span className="kindraw-app-sidebar__primary-button-icon">
                  {PlusIcon}
                </span>
                <span>{t("kindraw.sidebar.newCanvasAction")}</span>
              </button>

              {composerMode === "drawing" && composerConfig ? (
                <form
                  className="kindraw-app-sidebar__inline-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = composerValue.trim();
                    if (!value) {
                      return;
                    }

                    void Promise.resolve(
                      onCreateItem("drawing", selectedTag?.id || null, value),
                    ).then(closeComposer);
                  }}
                >
                  <input
                    className="kindraw-app-sidebar__inline-input"
                    disabled={isMutating}
                    onChange={(event) => setComposerValue(event.target.value)}
                    placeholder={composerConfig.placeholder}
                    ref={composerInputRef}
                    type="text"
                    value={composerValue}
                  />
                  <div className="kindraw-app-sidebar__inline-actions">
                    <button
                      className="kindraw-app-sidebar__mini-action kindraw-app-sidebar__mini-action--solid"
                      disabled={isMutating || !composerValue.trim()}
                      type="submit"
                    >
                      {composerConfig.submitLabel}
                    </button>
                    <button
                      className="kindraw-app-sidebar__mini-action"
                      onClick={closeComposer}
                      type="button"
                    >
                      {t("buttons.cancel")}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>

            <section className="kindraw-app-sidebar__section">
              <div className="kindraw-app-sidebar__section-header">
                <span className="kindraw-app-sidebar__section-label">
                  {t("kindraw.sidebar.mainMenu")}
                </span>
              </div>

              <nav className="kindraw-app-sidebar__menu-list">
                {menuItems.map((item) => (
                  <button
                    className={`kindraw-app-sidebar__menu-item${
                      selectedView === item.id
                        ? " kindraw-app-sidebar__menu-item--active"
                        : ""
                    }`}
                    key={item.id}
                    onClick={() => setSelectedView(item.id)}
                    type="button"
                  >
                    <span className="kindraw-app-sidebar__menu-item-copy">
                      <span className="kindraw-app-sidebar__menu-icon">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </span>
                    <span className="kindraw-app-sidebar__menu-count">
                      {item.count}
                    </span>
                  </button>
                ))}
              </nav>
            </section>

            <section className="kindraw-app-sidebar__section">
              <div className="kindraw-app-sidebar__section-header">
                <span className="kindraw-app-sidebar__section-label">
                  {t("kindraw.sidebar.tags")}
                </span>
                <button
                  className="kindraw-app-sidebar__section-action"
                  disabled={isMutating}
                  onClick={() => openComposer("tag")}
                  type="button"
                >
                  {PlusIcon}
                  <span>{t("kindraw.sidebar.createTagAction")}</span>
                </button>
              </div>

              {composerMode === "tag" && composerConfig ? (
                <form
                  className="kindraw-app-sidebar__inline-composer kindraw-app-sidebar__inline-composer--compact"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const value = composerValue.trim();
                    if (!value) {
                      return;
                    }

                    const createdTagId = await onCreateTag(value);
                    if (typeof createdTagId === "string") {
                      setSelectedTagFilter(createdTagId);
                    }
                    closeComposer();
                  }}
                >
                  <input
                    className="kindraw-app-sidebar__inline-input"
                    disabled={isMutating}
                    onChange={(event) => setComposerValue(event.target.value)}
                    placeholder={composerConfig.placeholder}
                    ref={composerInputRef}
                    type="text"
                    value={composerValue}
                  />
                  <div className="kindraw-app-sidebar__inline-actions">
                    <button
                      className="kindraw-app-sidebar__mini-action kindraw-app-sidebar__mini-action--solid"
                      disabled={isMutating || !composerValue.trim()}
                      type="submit"
                    >
                      {composerConfig.submitLabel}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="kindraw-app-sidebar__tag-list">
                <button
                  className={`kindraw-app-sidebar__tag-filter${
                    selectedTagFilter === TAG_FILTER_ALL
                      ? " kindraw-app-sidebar__tag-filter--active"
                      : ""
                  }`}
                  onClick={() => setSelectedTagFilter(TAG_FILTER_ALL)}
                  type="button"
                >
                  <span className="kindraw-app-sidebar__tag-filter-label">
                    {t("kindraw.sidebar.tagFilterAll")}
                  </span>
                </button>

                <button
                  className={`kindraw-app-sidebar__tag-filter${
                    selectedTagFilter === TAG_FILTER_UNTAGGED
                      ? " kindraw-app-sidebar__tag-filter--active"
                      : ""
                  }`}
                  onClick={() => setSelectedTagFilter(TAG_FILTER_UNTAGGED)}
                  type="button"
                >
                  <span className="kindraw-app-sidebar__tag-filter-dot kindraw-app-sidebar__tag-filter-dot--neutral" />
                  <span className="kindraw-app-sidebar__tag-filter-label">
                    {t("kindraw.sidebar.tagFilterUntagged")}
                  </span>
                </button>

                {tags.map((tag) => {
                  const swatch = getTagColor(tag.id);
                  return (
                    <button
                      className={`kindraw-app-sidebar__tag-filter${
                        selectedTagFilter === tag.id
                          ? " kindraw-app-sidebar__tag-filter--active"
                          : ""
                      }`}
                      key={tag.id}
                      onClick={() => setSelectedTagFilter(tag.id)}
                      style={
                        {
                          "--kindraw-tag-accent": swatch,
                        } as CSSProperties
                      }
                      type="button"
                    >
                      <span className="kindraw-app-sidebar__tag-filter-dot" />
                      <span className="kindraw-app-sidebar__tag-filter-label">
                        {tag.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="kindraw-app-sidebar__section kindraw-app-sidebar__section--cards">
              <div className="kindraw-app-sidebar__section-header">
                <span className="kindraw-app-sidebar__section-label">
                  {canvasSectionLabel}
                </span>
                <span className="kindraw-app-sidebar__section-count">
                  {visibleCanvases.length}
                </span>
              </div>

              {visibleCanvases.length ? (
                <ul className="kindraw-app-sidebar__canvas-list">
                  {visibleCanvases.map((item) => {
                    const isActive = currentItem?.id === item.id;
                    const tagColor = item.folderId
                      ? getTagColor(item.folderId)
                      : "#C8D1DE";
                    const showPublic = item.shareLinks.some(
                      (link) => !link.revokedAt,
                    );
                    const showLive = Boolean(item.collaborationRoomId);

                    return (
                      <li
                        className={`kindraw-app-sidebar__canvas-card${
                          isActive
                            ? " kindraw-app-sidebar__canvas-card--active"
                            : ""
                        }`}
                        key={item.id}
                        style={
                          {
                            "--kindraw-card-accent": tagColor,
                          } as CSSProperties
                        }
                      >
                        <button
                          className="kindraw-app-sidebar__canvas-link"
                          onClick={() => navigateKindraw(buildItemPath(item))}
                          type="button"
                        >
                          <span className="kindraw-app-sidebar__canvas-preview">
                            <span className="kindraw-app-sidebar__canvas-preview-grid" />
                            <span className="kindraw-app-sidebar__canvas-preview-mark">
                              {file}
                            </span>
                          </span>
                          <span className="kindraw-app-sidebar__canvas-copy">
                            <strong>{item.title}</strong>
                            <span>{formatCanvasUpdatedAt(item.updatedAt)}</span>
                          </span>
                        </button>

                        <div className="kindraw-app-sidebar__canvas-meta">
                          <div className="kindraw-app-sidebar__canvas-flags">
                            {showPublic ? (
                              <span className="kindraw-app-sidebar__canvas-flag">
                                {t("kindraw.sidebar.publicFlag")}
                              </span>
                            ) : null}
                            {showLive ? (
                              <span className="kindraw-app-sidebar__canvas-flag kindraw-app-sidebar__canvas-flag--live">
                                {t("kindraw.sidebar.liveFlag")}
                              </span>
                            ) : null}
                            {item.archivedAt ? (
                              <span className="kindraw-app-sidebar__canvas-flag">
                                {t("kindraw.sidebar.archivedFlag")}
                              </span>
                            ) : null}
                            {isActive && currentDrawingStatus ? (
                              <span
                                className={`kindraw-app-sidebar__status kindraw-app-sidebar__status--${
                                  drawingSaveState || "idle"
                                }`}
                              >
                                {currentDrawingStatus}
                              </span>
                            ) : null}
                          </div>

                          <div className="kindraw-app-sidebar__canvas-controls">
                            <CanvasTagMenu
                              currentTagId={item.folderId}
                              disabled={isMutating}
                              itemId={item.id}
                              onAssignTag={onAssignTag}
                              onCreateTag={onCreateTag}
                              tags={tags}
                            />
                            <CanvasActionsMenu
                              disabled={isMutating}
                              item={item}
                              onArchiveItem={onArchiveItem}
                              onDeleteItem={onDeleteItem}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="kindraw-app-sidebar__empty">{emptyStateLabel}</p>
              )}
            </section>

            {errorMessage ? (
              <p className="kindraw-app-sidebar__error">{errorMessage}</p>
            ) : null}
          </div>
        )}
      </Sidebar>
    </>
  );
};
