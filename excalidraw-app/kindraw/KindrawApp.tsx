import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
  useSyncExternalStore,
} from "react";

import {
  convertDrawingToHybrid,
  createHybridItem,
  createFolder,
  createItem,
  deleteHybridItem,
  deleteFolder,
  deleteItem,
  getPublicItem,
  getSession,
  getWorkspaceTree,
  joinWaitlist,
  logout,
  openGithubLogin,
  openGoogleLogin,
  renameFolder,
  updateHybridItemMeta,
  updateItemMeta,
} from "./api";
import { getLanguage, t } from "@excalidraw/excalidraw/i18n";

import { useSetAtom } from "../app-jotai";
import {
  SettingsDialog,
  settingsDialogStateAtom,
} from "../components/SettingsDialog";

import { tCount, useKindrawI18n } from "./i18n";

import { DocEditorPage } from "./DocEditorPage";
import { DrawingEditorPage } from "./DrawingEditorPage";
import { HybridEditorPage } from "./HybridEditorPage";
import { HybridPublicShareView } from "./HybridPublicShareView";
import { ShareFolderModal } from "./ShareFolderModal";
import { GoogleGlyph, KindrawIcon } from "./icons";
import { userHandle } from "./identity";
import { createInitialItemContent } from "./content";
import {
  buildFolderPath,
  buildHybridItemPath,
  buildHybridPath,
  buildItemPath,
  getLocationPathname,
  matchKindrawRoute,
  navigateKindraw,
  subscribeToLocation,
} from "./router";
import { getKindrawThumbnail, pruneKindrawThumbnails } from "./thumbnails";
import { isKindrawHybridItem } from "./types";
import { getErrorMessage } from "./utils";

import type { KindrawThumbnail } from "./thumbnails";

import "./kindraw.scss";

import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";

import type { KindrawIconName } from "./icons";

import type {
  KindrawFolder,
  KindrawHybridItem,
  KindrawItem,
  KindrawItemKind,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawTreeItem,
  KindrawWorkspaceTreeResponse,
} from "./types";

/* ────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────── */

const formatUpdatedAt = (updatedAt: string) =>
  new Date(updatedAt).toLocaleString(getLanguage().code, {
    dateStyle: "short",
    timeStyle: "short",
  });

const RELATIVE_TIME_DIVISIONS: {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

const formatRelativeTime = (updatedAt: string) => {
  const relativeTimeFormatter = new Intl.RelativeTimeFormat(
    getLanguage().code,
    {
      numeric: "auto",
    },
  );
  let duration = (new Date(updatedAt).getTime() - Date.now()) / 1000;
  if (Number.isNaN(duration)) {
    return formatUpdatedAt(updatedAt);
  }

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return formatUpdatedAt(updatedAt);
};

const getFolderChildren = (folders: KindrawFolder[], parentId: string | null) =>
  folders.filter((folder) => folder.parentId === parentId);

const getFolderTrail = (
  folders: KindrawFolder[],
  folderId: string | null,
): KindrawFolder[] => {
  if (!folderId) {
    return [];
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const trail: KindrawFolder[] = [];
  let current = byId.get(folderId) || null;

  while (current) {
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) || null : null;
  }

  return trail;
};

const countItemsByFolder = (items: KindrawTreeItem[]) => {
  const counts = new Map<string | null, number>();
  for (const item of items) {
    counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
  }
  return counts;
};

const getItemKindKey = (item: KindrawTreeItem) =>
  isKindrawHybridItem(item) ? "hybrid" : item.kind;

const getKindLabel = (kindKey: string, translate: typeof t): string => {
  switch (kindKey) {
    case "drawing":
      return translate("kindraw.kind.drawing");
    case "doc":
      return translate("kindraw.kind.doc");
    case "hybrid":
      return translate("kindraw.kind.hybrid");
    default:
      return kindKey;
  }
};

const KIND_ICON: Record<string, KindrawIconName> = {
  drawing: "pen",
  doc: "doc",
  hybrid: "hybrid",
};

const openTreeItem = (item: KindrawTreeItem) => {
  if (isKindrawHybridItem(item)) {
    navigateKindraw(buildHybridItemPath(item));
  } else if (item.kind === "drawing") {
    // /draw/* é servido pelo ExcalidrawApp completo (outro shell);
    // carga de página inteira evita montar o editor via transição SPA.
    window.location.assign(buildItemPath(item));
  } else {
    navigateKindraw(buildItemPath(item));
  }
};

type KindrawSharedView = "links" | "live" | "shared-with-me" | null;

/* ────────────────────────────────────────────────────────
   Menus (popover) e modal temático
   ──────────────────────────────────────────────────────── */

const KindrawMenuWrap = ({
  open,
  onClose,
  button,
  align = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  button: ReactNode;
  align?: "left" | "right";
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="kindraw-menuwrap" ref={ref}>
      {button}
      {open ? (
        <div
          className={`kindraw-popover ${
            align === "left"
              ? "kindraw-popover--menu-left"
              : "kindraw-popover--menu"
          }`}
        >
          <div className="kindraw-menu" role="menu">
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
};

type KindrawDialog =
  | {
      type: "prompt";
      title: string;
      confirmLabel: string;
      initialValue: string;
      placeholder?: string;
      onSubmit: (value: string) => void;
    }
  | {
      type: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      onConfirm: () => void;
    };

const KindrawDialogModal = ({
  dialog,
  onClose,
}: {
  dialog: KindrawDialog;
  onClose: () => void;
}) => {
  const { t } = useKindrawI18n();
  const [value, setValue] = useState(
    dialog.type === "prompt" ? dialog.initialValue : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleConfirm = () => {
    if (dialog.type === "prompt") {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      onClose();
      dialog.onSubmit(trimmed);
    } else {
      onClose();
      dialog.onConfirm();
    }
  };

  return (
    <div
      className="kindraw-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div aria-modal="true" className="kindraw-modal" role="dialog">
        <h2>{dialog.title}</h2>
        {dialog.type === "prompt" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
          >
            <input
              className="kindraw-modal__input"
              onChange={(event) => setValue(event.target.value)}
              placeholder={dialog.placeholder}
              ref={inputRef}
              value={value}
            />
          </form>
        ) : (
          <p>{dialog.message}</p>
        )}
        <div className="kindraw-modal__actions">
          <button
            className="kindraw-btn kindraw-btn--soft"
            onClick={onClose}
            type="button"
          >
            {t("kindraw.actions.cancel")}
          </button>
          <button
            className={`kindraw-btn ${
              dialog.type === "confirm"
                ? "kindraw-btn--danger"
                : "kindraw-btn--primary"
            }`}
            disabled={dialog.type === "prompt" && !value.trim()}
            onClick={handleConfirm}
            type="button"
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Command palette (⌘K / Ctrl+K) — busca global no workspace
   ──────────────────────────────────────────────────────── */

const CMDK_RECENT_LIMIT = 8;
const CMDK_MAX_RESULTS = 25;

const KindrawCommandPalette = ({
  open,
  onClose,
  items,
  folders,
}: {
  open: boolean;
  onClose: () => void;
  items: KindrawTreeItem[];
  folders: KindrawFolder[];
}) => {
  const { t } = useKindrawI18n();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reseta busca e seleção sempre que o palette abre; foca o input.
  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();

  const results = normalizedQuery
    ? items
        .filter((item) => item.title.toLowerCase().includes(normalizedQuery))
        .slice(0, CMDK_MAX_RESULTS)
    : [...items]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, CMDK_RECENT_LIMIT);

  // Mantém o índice ativo dentro dos limites quando a lista muda.
  useEffect(() => {
    setActiveIndex((prev) => {
      if (results.length === 0) {
        return 0;
      }
      return Math.min(prev, results.length - 1);
    });
  }, [results.length]);

  // Faz o item ativo rolar para a vista quando navega via teclado.
  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    const node = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) {
    return null;
  }

  const folderNameForItem = (folderId: string | null) => {
    if (!folderId) {
      return t("kindraw.sidebar.root");
    }
    const trail = getFolderTrail(folders, folderId);
    return trail.length
      ? trail[trail.length - 1].name
      : t("kindraw.sidebar.root");
  };

  const openResult = (item: KindrawTreeItem) => {
    onClose();
    openTreeItem(item);
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        results.length ? Math.min(prev + 1, results.length - 1) : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) {
        openResult(item);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="kindraw-cmdk-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-modal="true"
        className="kindraw-cmdk"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="kindraw-cmdk__head">
          <KindrawIcon name="search" size={17} />
          <input
            aria-activedescendant={
              results[activeIndex]
                ? `kindraw-cmdk-option-${results[activeIndex].id}`
                : undefined
            }
            aria-label={t("kindraw.commandPalette.searchAria")}
            aria-controls="kindraw-cmdk-list"
            autoComplete="off"
            className="kindraw-cmdk__input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("kindraw.commandPalette.searchPlaceholder")}
            ref={inputRef}
            role="combobox"
            aria-expanded={results.length > 0}
            type="text"
            value={query}
          />
        </div>

        {results.length ? (
          <ul
            className="kindraw-cmdk__list"
            id="kindraw-cmdk-list"
            ref={listRef}
            role="listbox"
          >
            {results.map((item, index) => {
              const kindKey = getItemKindKey(item);
              const active = index === activeIndex;
              return (
                <li
                  aria-selected={active}
                  className={`kindraw-cmdk__item${
                    active ? " kindraw-cmdk__item--active" : ""
                  }`}
                  id={`kindraw-cmdk-option-${item.id}`}
                  key={item.id}
                  onClick={() => openResult(item)}
                  onMouseMove={() => setActiveIndex(index)}
                  role="option"
                >
                  <span className="kindraw-cmdk__item-icon">
                    <KindrawIcon name={KIND_ICON[kindKey]} size={16} />
                  </span>
                  <span className="kindraw-cmdk__item-title">{item.title}</span>
                  <span className={`kindraw-kind kindraw-kind--${kindKey}`}>
                    {getKindLabel(kindKey, t)}
                  </span>
                  <span className="kindraw-cmdk__item-folder">
                    {folderNameForItem(item.folderId)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="kindraw-cmdk__empty">
            {normalizedQuery
              ? t("kindraw.commandPalette.noResults")
              : t("kindraw.commandPalette.emptyWorkspace")}
          </div>
        )}

        <div className="kindraw-cmdk__foot">
          {t("kindraw.commandPalette.keyboardHint")}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Sidebar — árvore de pastas
   ──────────────────────────────────────────────────────── */

const FolderTree = ({
  currentFolderId,
  folders,
  itemCounts,
  parentId,
  onNavigate,
}: {
  currentFolderId: string | null;
  folders: KindrawFolder[];
  itemCounts: Map<string | null, number>;
  parentId: string | null;
  onNavigate: (folderId: string) => void;
}) => {
  const children = getFolderChildren(folders, parentId);
  if (!children.length) {
    return null;
  }

  return (
    <ul className="kindraw-tree">
      {children.map((folder) => (
        <li key={folder.id}>
          <button
            className={`kindraw-tree__button${
              currentFolderId === folder.id
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => onNavigate(folder.id)}
            type="button"
          >
            <KindrawIcon name="folder" size={16} />
            <span className="kindraw-tree__label">{folder.name}</span>
            <em className="kindraw-tree__count">
              {itemCounts.get(folder.id) || 0}
            </em>
          </button>
          <FolderTree
            currentFolderId={currentFolderId}
            folders={folders}
            itemCounts={itemCounts}
            onNavigate={onNavigate}
            parentId={folder.id}
          />
        </li>
      ))}
    </ul>
  );
};

/* ────────────────────────────────────────────────────────
   Cards de item
   ──────────────────────────────────────────────────────── */

// Preview do canvas, renderizado no client e só quando o card entra na
// viewport (IntersectionObserver). Drawings/híbridos geram um SVG do conteúdo;
// docs e canvas vazios caem no fallback (ícone do tipo + "Vazio").
const CardThumb = ({
  item,
  kindKey,
}: {
  item: KindrawTreeItem;
  kindKey: KindrawIconName;
}) => {
  const { t } = useKindrawI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const [thumb, setThumb] = useState<KindrawThumbnail | null | "loading">(null);

  const canPreview = isKindrawHybridItem(item) || item.kind === "drawing";
  const cacheKey = `${item.id}:${item.updatedAt}`;

  useEffect(() => {
    if (!canPreview) {
      return;
    }
    setThumb("loading");

    const node = ref.current;
    if (!node) {
      return;
    }

    let cancelled = false;
    let loaded = false;
    let observer: IntersectionObserver | null = null;

    const load = () => {
      if (loaded) {
        return;
      }
      loaded = true;
      observer?.disconnect();
      void getKindrawThumbnail(item).then((result) => {
        if (!cancelled) {
          setThumb(result);
        }
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            load();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(node);
      // fallback: se o card já está visível no mount (caso comum no reload),
      // o callback do observer pode não disparar de forma confiável — checa
      // a posição e carrega direto.
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
        load();
      }
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
    // cacheKey muda quando o item é atualizado, regenerando o preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, canPreview]);

  if (item.thumbnailUrl) {
    return (
      <span className="kindraw-card__thumb-inner" ref={ref}>
        <img alt="" src={item.thumbnailUrl} />
      </span>
    );
  }

  if (thumb && thumb !== "loading" && thumb.status === "ready") {
    return (
      <span className="kindraw-card__thumb-inner" ref={ref}>
        <img alt="" className="kindraw-card__thumb-svg" src={thumb.dataUri} />
      </span>
    );
  }

  const isEmpty =
    canPreview && thumb !== "loading" && thumb?.status === "empty";

  return (
    <span className="kindraw-card__thumb-inner" ref={ref}>
      <span className="kindraw-card__thumb-fallback">
        <KindrawIcon name={kindKey} size={34} />
        {isEmpty ? (
          <span className="kindraw-card__thumb-empty">
            {t("kindraw.card.emptyThumb")}
          </span>
        ) : null}
      </span>
    </span>
  );
};

const WorkspaceItemCard = ({
  item,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onRename,
  onDelete,
  onConvertToHybrid,
  selectionMode,
  selected,
  onToggleSelect,
  readOnly = false,
}: {
  item: KindrawTreeItem;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRename: () => void;
  onDelete: () => void;
  onConvertToHybrid: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  readOnly?: boolean;
}) => {
  const { t } = useKindrawI18n();
  const kindKey = getItemKindKey(item);

  return (
    <article
      className={`kindraw-card${
        selectionMode ? " kindraw-card--selectable" : ""
      }${selected ? " kindraw-card--selected" : ""}`}
    >
      <button
        aria-label={
          selectionMode
            ? selected
              ? t("kindraw.card.deselectAria", { title: item.title })
              : t("kindraw.card.selectAria", { title: item.title })
            : t("kindraw.card.openAria", { title: item.title })
        }
        aria-pressed={selectionMode ? selected : undefined}
        className="kindraw-card__thumb"
        onClick={() => (selectionMode ? onToggleSelect() : openTreeItem(item))}
        type="button"
      >
        {selectionMode ? (
          <span
            aria-hidden="true"
            className={`kindraw-card__check${
              selected ? " kindraw-card__check--on" : ""
            }`}
          >
            {selected ? <KindrawIcon name="check" size={14} /> : null}
          </span>
        ) : null}
        <CardThumb item={item} kindKey={KIND_ICON[kindKey]} />
      </button>
      <div className="kindraw-card__body">
        <div className="kindraw-card__top">
          <span className={`kindraw-kind kindraw-kind--${kindKey}`}>
            {getKindLabel(kindKey, t)}
          </span>
          <span className="kindraw-card__topright">
            {readOnly ? (
              <span
                className="kindraw-card__readonly"
                title={t("kindraw.card.readOnlyTitle")}
              >
                <KindrawIcon name="users" size={13} />{" "}
                {t("kindraw.card.readOnlyLabel")}
              </span>
            ) : null}
            {item.shareLinks.length ? (
              <span className="kindraw-card__shared">
                <KindrawIcon name="link" size={13} />{" "}
                {t("kindraw.card.publicLabel")}
              </span>
            ) : null}
            {selectionMode || readOnly ? null : (
              <KindrawMenuWrap
                button={
                  <button
                    aria-expanded={menuOpen}
                    aria-label={t("kindraw.card.actionsAria", {
                      title: item.title,
                    })}
                    className="kindraw-dots"
                    onClick={onToggleMenu}
                    type="button"
                  >
                    <KindrawIcon name="dots" size={16} />
                  </button>
                }
                onClose={onCloseMenu}
                open={menuOpen}
              >
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    onCloseMenu();
                    onRename();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {t("kindraw.actions.rename")}
                </button>
                {!isKindrawHybridItem(item) && item.kind === "drawing" ? (
                  <button
                    className="kindraw-menu__item"
                    onClick={() => {
                      onCloseMenu();
                      onConvertToHybrid();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {t("kindraw.actions.convertToHybrid")}
                  </button>
                ) : null}
                <button
                  className="kindraw-menu__item kindraw-menu__item--danger"
                  onClick={() => {
                    onCloseMenu();
                    onDelete();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {isKindrawHybridItem(item)
                    ? t("kindraw.actions.unlink")
                    : t("kindraw.actions.delete")}
                </button>
              </KindrawMenuWrap>
            )}
          </span>
        </div>
        <button
          className="kindraw-card__title"
          onClick={() =>
            selectionMode ? onToggleSelect() : openTreeItem(item)
          }
          type="button"
        >
          {item.title}
        </button>
        <span
          className="kindraw-card__meta"
          title={formatUpdatedAt(item.updatedAt)}
        >
          <KindrawIcon name="clock" size={13} />{" "}
          {formatRelativeTime(item.updatedAt)}
        </span>
      </div>
    </article>
  );
};

/* ────────────────────────────────────────────────────────
   Workspace
   ──────────────────────────────────────────────────────── */

const WorkspacePage = ({
  currentFolderId,
  searchQuery,
  sharedView,
  tree,
  onCreateFolder,
  onCreateItem,
  onCreateHybridItem,
  onDeleteHybridItem,
  onDeleteFolder,
  onDeleteItem,
  onNavigateFolder,
  onNavigateSharedWithMe,
  onRenameHybridItem,
  onRenameFolder,
  onRenameItem,
  onConvertItemToHybrid,
  onShareFolder,
  onBulkDelete,
  onBulkMove,
  onBulkMoveToNewFolder,
}: {
  currentFolderId: string | null;
  searchQuery: string;
  sharedView: KindrawSharedView;
  tree: KindrawWorkspaceTreeResponse;
  onCreateFolder: (parentId: string | null) => void;
  onCreateItem: (kind: KindrawItemKind, folderId: string | null) => void;
  onCreateHybridItem: (folderId: string | null) => void;
  onDeleteFolder: (folder: KindrawFolder) => void;
  onDeleteItem: (item: KindrawItem) => void;
  onDeleteHybridItem: (item: KindrawHybridItem) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onNavigateSharedWithMe: () => void;
  onRenameFolder: (folder: KindrawFolder) => void;
  onRenameItem: (item: KindrawItem) => void;
  onRenameHybridItem: (item: KindrawHybridItem) => void;
  onConvertItemToHybrid: (item: KindrawItem) => void;
  onShareFolder: (folder: KindrawFolder) => void;
  onBulkDelete: (items: KindrawTreeItem[]) => Promise<void>;
  onBulkMove: (
    items: KindrawTreeItem[],
    folderId: string | null,
  ) => Promise<void>;
  onBulkMoveToNewFolder: (
    items: KindrawTreeItem[],
    name: string,
    parentId: string | null,
  ) => Promise<void>;
}) => {
  const { t } = useKindrawI18n();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  const closeItemMenu = useCallback(() => setOpenMenuId(null), []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setMoveOpen(false);
    setFolderQuery("");
    setNewFolderName("");
    setShowNewFolderInput(false);
  }, []);

  // Reseta a seleção ao trocar de pasta / visão / busca — seleção não
  // atravessa contextos (só itens visíveis podem ser selecionados).
  useEffect(() => {
    exitSelection();
  }, [currentFolderId, sharedView, searchQuery, exitSelection]);

  // Esc cancela o modo seleção (quando o popover de mover está fechado;
  // o KindrawMenuWrap já trata Esc para fechar o popover).
  useEffect(() => {
    if (!selectionMode) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moveOpen) {
        exitSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectionMode, moveOpen, exitSelection]);

  const currentFolder = sharedView
    ? null
    : tree.folders.find((folder) => folder.id === currentFolderId) || null;
  const folderTrail = getFolderTrail(tree.folders, currentFolderId);
  const itemCounts = countItemsByFolder(tree.items);

  // Pastas compartilhadas COMIGO (têm `shared` definido pelo backend).
  const sharedWithMeFolders = tree.folders.filter((folder) => folder.shared);

  // Read-only quando estou dentro de uma pasta compartilhada comigo como
  // viewer. Editor mantém as ações; pasta própria nunca é read-only.
  const isReadOnlyFolder = currentFolder?.shared?.role === "viewer";
  const isSharedFolder = Boolean(currentFolder?.shared);

  const visibleFolders =
    sharedView === "shared-with-me"
      ? sharedWithMeFolders
      : sharedView
      ? []
      : getFolderChildren(tree.folders, currentFolderId);

  let scopedItems: KindrawTreeItem[];
  if (sharedView === "links") {
    scopedItems = tree.items.filter((item) => item.shareLinks.length > 0);
  } else if (sharedView === "live") {
    scopedItems = tree.items.filter(
      (item) => !isKindrawHybridItem(item) && item.collaborationRoomId !== null,
    );
  } else if (sharedView === "shared-with-me") {
    // O índice de "compartilhados comigo" mostra apenas as pastas; os itens
    // aparecem ao navegar para dentro de cada pasta compartilhada.
    scopedItems = [];
  } else {
    scopedItems = tree.items.filter(
      (item) => item.folderId === currentFolderId,
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? scopedItems.filter((item) =>
        item.title.toLowerCase().includes(normalizedQuery),
      )
    : scopedItems;
  // mais recentes primeiro (por última atualização)
  const visibleItems = [...filteredItems].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const heading = sharedView
    ? sharedView === "links"
      ? t("kindraw.sidebar.publicLinks")
      : sharedView === "live"
      ? t("kindraw.sidebar.liveSessions")
      : t("kindraw.sidebar.sharedWithMe")
    : currentFolder?.name || t("kindraw.sidebar.library");

  // Seleção só existe no workspace autenticado, fora de visões compartilhadas
  // e fora de pastas compartilhadas comigo (não posso renomear/mover itens
  // alheios em massa pela UI).
  const canSelect = !sharedView && !isSharedFolder && visibleItems.length > 0;
  const selectedItems = visibleItems.filter((item) => selectedIds.has(item.id));
  const selectedCount = selectedItems.length;
  const allSelected =
    visibleItems.length > 0 && selectedCount === visibleItems.length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === visibleItems.length
        ? new Set()
        : new Set(visibleItems.map((item) => item.id)),
    );
  }, [visibleItems]);

  const filteredFolders = (() => {
    const q = folderQuery.trim().toLowerCase();
    const list = q
      ? tree.folders.filter((folder) => folder.name.toLowerCase().includes(q))
      : tree.folders;
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, getLanguage().code, {
        sensitivity: "base",
      }),
    );
  })();

  const handleBulkDelete = useCallback(async () => {
    const items = visibleItems.filter((item) => selectedIds.has(item.id));
    if (!items.length) {
      return;
    }
    await onBulkDelete(items);
    exitSelection();
  }, [visibleItems, selectedIds, onBulkDelete, exitSelection]);

  const handleBulkMove = useCallback(
    async (folderId: string | null) => {
      const items = visibleItems.filter((item) => selectedIds.has(item.id));
      if (!items.length) {
        return;
      }
      await onBulkMove(items, folderId);
      exitSelection();
    },
    [visibleItems, selectedIds, onBulkMove, exitSelection],
  );

  const handleBulkMoveToNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    const items = visibleItems.filter((item) => selectedIds.has(item.id));
    if (!name || !items.length) {
      return;
    }
    await onBulkMoveToNewFolder(items, name, currentFolderId);
    exitSelection();
  }, [
    newFolderName,
    visibleItems,
    selectedIds,
    onBulkMoveToNewFolder,
    currentFolderId,
    exitSelection,
  ]);

  return (
    <section className="kindraw-workspace">
      <div className="kindraw-main-head">
        <div>
          <nav
            aria-label={t("kindraw.workspace.breadcrumbAria")}
            className="kindraw-crumb"
          >
            {sharedView ? (
              <span>{t("kindraw.breadcrumb.shared")}</span>
            ) : isSharedFolder ? (
              <>
                <button onClick={() => onNavigateSharedWithMe()} type="button">
                  {t("kindraw.sidebar.sharedWithMe")}
                </button>
                {currentFolder ? <span>/ {currentFolder.name}</span> : null}
              </>
            ) : (
              <>
                <button onClick={() => onNavigateFolder(null)} type="button">
                  {t("kindraw.sidebar.root")}
                </button>
                {folderTrail.slice(0, -1).map((folder) => (
                  <span key={folder.id}>
                    /{" "}
                    <button
                      onClick={() => onNavigateFolder(folder.id)}
                      type="button"
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
                {currentFolder ? <span>/ {currentFolder.name}</span> : null}
              </>
            )}
          </nav>
          <div className="kindraw-main-head__title">
            <h1>{heading}</h1>
            {currentFolder && !isSharedFolder ? (
              <KindrawMenuWrap
                align="left"
                button={
                  <button
                    aria-expanded={openMenuId === "current-folder"}
                    aria-label={t("kindraw.workspace.currentFolderActionsAria")}
                    className="kindraw-dots kindraw-dots--visible"
                    onClick={() =>
                      setOpenMenuId(
                        openMenuId === "current-folder"
                          ? null
                          : "current-folder",
                      )
                    }
                    type="button"
                  >
                    <KindrawIcon name="dots" size={16} />
                  </button>
                }
                onClose={closeItemMenu}
                open={openMenuId === "current-folder"}
              >
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    closeItemMenu();
                    onShareFolder(currentFolder);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {t("kindraw.actions.share")}
                </button>
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    closeItemMenu();
                    onRenameFolder(currentFolder);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {t("kindraw.actions.renameFolder")}
                </button>
                <button
                  className="kindraw-menu__item kindraw-menu__item--danger"
                  onClick={() => {
                    closeItemMenu();
                    onDeleteFolder(currentFolder);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {t("kindraw.actions.deleteFolder")}
                </button>
              </KindrawMenuWrap>
            ) : null}
            {currentFolder?.shared ? (
              <span
                className={`kindraw-sharebadge${
                  isReadOnlyFolder ? " kindraw-sharebadge--viewer" : ""
                }`}
              >
                <KindrawIcon name="users" size={13} />{" "}
                {t("kindraw.workspace.sharedFrom", {
                  login: currentFolder.shared.ownerLogin,
                })}{" "}
                ·{" "}
                {isReadOnlyFolder
                  ? t("kindraw.roles.viewer")
                  : t("kindraw.roles.editor")}
              </span>
            ) : null}
          </div>
          <p className="kindraw-main-head__meta">
            {sharedView === "shared-with-me"
              ? tCount("kindraw.workspace.folderCount", visibleFolders.length)
              : sharedView
              ? tCount("kindraw.workspace.itemCount", visibleItems.length)
              : isSharedFolder
              ? tCount("kindraw.workspace.itemCount", visibleItems.length)
              : `${tCount(
                  "kindraw.workspace.folderCount",
                  visibleFolders.length,
                )} · ${tCount(
                  "kindraw.workspace.itemCount",
                  visibleItems.length,
                )}`}
          </p>
        </div>
        <div className="kindraw-main-head__actions">
          {sharedView === "shared-with-me" ||
          isReadOnlyFolder ? null : selectionMode ? (
            <button
              className="kindraw-btn kindraw-btn--soft"
              onClick={exitSelection}
              type="button"
            >
              <KindrawIcon name="close" size={16} />{" "}
              {t("kindraw.workspace.cancelSelection")}
            </button>
          ) : (
            <>
              {canSelect ? (
                <button
                  className="kindraw-btn kindraw-btn--soft"
                  onClick={() => setSelectionMode(true)}
                  type="button"
                >
                  <KindrawIcon name="check" size={16} />{" "}
                  {t("kindraw.workspace.select")}
                </button>
              ) : null}
              <button
                className="kindraw-btn kindraw-btn--soft"
                onClick={() => onCreateFolder(currentFolderId)}
                type="button"
              >
                <KindrawIcon name="folder" size={16} />{" "}
                {t("kindraw.actions.newFolder")}
              </button>
              <KindrawMenuWrap
                button={
                  <button
                    aria-expanded={newMenuOpen}
                    className="kindraw-btn kindraw-btn--primary"
                    onClick={() => setNewMenuOpen(!newMenuOpen)}
                    type="button"
                  >
                    <KindrawIcon name="plus" size={16} />{" "}
                    {t("kindraw.actions.new")}{" "}
                    <KindrawIcon name="chevD" size={14} />
                  </button>
                }
                onClose={() => setNewMenuOpen(false)}
                open={newMenuOpen}
              >
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onCreateItem("drawing", currentFolderId);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <KindrawIcon name="pen" size={16} />{" "}
                  {t("kindraw.kind.drawing")}
                </button>
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onCreateItem("doc", currentFolderId);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <KindrawIcon name="doc" size={16} /> {t("kindraw.kind.doc")}
                </button>
                <button
                  className="kindraw-menu__item"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onCreateHybridItem(currentFolderId);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <KindrawIcon name="hybrid" size={16} />{" "}
                  {t("kindraw.kind.hybrid")}
                </button>
              </KindrawMenuWrap>
            </>
          )}
        </div>
      </div>

      {visibleFolders.length ? (
        <div className="kindraw-folderrow">
          {visibleFolders.map((folder) => (
            <div
              className={`kindraw-folderchip${
                folder.shared ? " kindraw-folderchip--shared" : ""
              }`}
              key={folder.id}
            >
              <button
                className="kindraw-folderchip__main"
                onClick={() => onNavigateFolder(folder.id)}
                type="button"
              >
                <KindrawIcon name="folder" size={18} />
                <span className="kindraw-folderchip__name">
                  {folder.name}
                  {folder.shared ? (
                    <em className="kindraw-folderchip__from">
                      {t("kindraw.workspace.sharedFrom", {
                        login: folder.shared.ownerLogin,
                      })}{" "}
                      ·{" "}
                      {folder.shared.role === "viewer"
                        ? t("kindraw.roles.viewer")
                        : t("kindraw.roles.editor")}
                    </em>
                  ) : null}
                </span>
                <em className="kindraw-folderchip__count">
                  {itemCounts.get(folder.id) || 0}
                </em>
              </button>
              {folder.shared ? null : (
                <KindrawMenuWrap
                  button={
                    <button
                      aria-expanded={openMenuId === `folder:${folder.id}`}
                      aria-label={t("kindraw.workspace.folderActionsAria", {
                        name: folder.name,
                      })}
                      className="kindraw-dots"
                      onClick={() =>
                        setOpenMenuId(
                          openMenuId === `folder:${folder.id}`
                            ? null
                            : `folder:${folder.id}`,
                        )
                      }
                      type="button"
                    >
                      <KindrawIcon name="dots" size={16} />
                    </button>
                  }
                  onClose={closeItemMenu}
                  open={openMenuId === `folder:${folder.id}`}
                >
                  <button
                    className="kindraw-menu__item"
                    onClick={() => {
                      closeItemMenu();
                      onShareFolder(folder);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {t("kindraw.actions.share")}
                  </button>
                  <button
                    className="kindraw-menu__item"
                    onClick={() => {
                      closeItemMenu();
                      onRenameFolder(folder);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {t("kindraw.actions.rename")}
                  </button>
                  <button
                    className="kindraw-menu__item kindraw-menu__item--danger"
                    onClick={() => {
                      closeItemMenu();
                      onDeleteFolder(folder);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {t("kindraw.actions.delete")}
                  </button>
                </KindrawMenuWrap>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {visibleItems.length ? (
        <div className="kindraw-grid">
          {visibleItems.map((item) => (
            <WorkspaceItemCard
              item={item}
              key={item.id}
              menuOpen={openMenuId === `item:${item.id}`}
              onCloseMenu={closeItemMenu}
              onDelete={() =>
                isKindrawHybridItem(item)
                  ? onDeleteHybridItem(item)
                  : onDeleteItem(item)
              }
              onRename={() =>
                isKindrawHybridItem(item)
                  ? onRenameHybridItem(item)
                  : onRenameItem(item)
              }
              onConvertToHybrid={() => {
                if (!isKindrawHybridItem(item) && item.kind === "drawing") {
                  onConvertItemToHybrid(item);
                }
              }}
              onToggleMenu={() =>
                setOpenMenuId(
                  openMenuId === `item:${item.id}` ? null : `item:${item.id}`,
                )
              }
              onToggleSelect={() => toggleSelect(item.id)}
              readOnly={isReadOnlyFolder || item.sharedRole === "viewer"}
              selected={selectedIds.has(item.id)}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      ) : sharedView === "shared-with-me" && visibleFolders.length ? null : (
        <p className="kindraw-empty">
          {normalizedQuery
            ? t("kindraw.workspace.emptySearch")
            : sharedView === "links"
            ? t("kindraw.workspace.emptyPublicLinks")
            : sharedView === "live"
            ? t("kindraw.workspace.emptyLive")
            : sharedView === "shared-with-me"
            ? t("kindraw.workspace.emptySharedWithMe")
            : t("kindraw.workspace.emptyFolder")}
        </p>
      )}

      {selectionMode ? (
        <div
          className="kindraw-bulkbar"
          role="toolbar"
          aria-label={t("kindraw.workspace.bulkActionsAria")}
        >
          <span className="kindraw-bulkbar__count">
            {tCount("kindraw.workspace.selectedCount", selectedCount)}
          </span>
          <button
            className="kindraw-btn kindraw-btn--ghost kindraw-btn--sm"
            onClick={toggleSelectAll}
            type="button"
          >
            {allSelected
              ? t("kindraw.workspace.clearSelection")
              : t("kindraw.workspace.selectAll")}
          </button>
          <span className="kindraw-bulkbar__sep" aria-hidden="true" />
          <KindrawMenuWrap
            align="left"
            button={
              <button
                aria-expanded={moveOpen}
                className="kindraw-btn kindraw-btn--soft kindraw-btn--sm"
                disabled={selectedCount === 0}
                onClick={() => setMoveOpen((open) => !open)}
                type="button"
              >
                <KindrawIcon name="move" size={15} />{" "}
                {t("kindraw.workspace.moveToFolder")}
              </button>
            }
            onClose={() => setMoveOpen(false)}
            open={moveOpen}
          >
            <div className="kindraw-movepop">
              <input
                aria-label={t("kindraw.workspace.searchFolderAria")}
                className="kindraw-movepop__search"
                onChange={(event) => setFolderQuery(event.target.value)}
                placeholder={t("kindraw.workspace.searchFolderPlaceholder")}
                type="search"
                value={folderQuery}
              />
              <div className="kindraw-movepop__list">
                <button
                  className="kindraw-menu__item"
                  onClick={() => void handleBulkMove(null)}
                  role="menuitem"
                  type="button"
                >
                  <KindrawIcon name="home" size={16} />{" "}
                  {t("kindraw.workspace.moveToRoot")}
                </button>
                {filteredFolders.map((folder) => (
                  <button
                    className="kindraw-menu__item"
                    key={folder.id}
                    onClick={() => void handleBulkMove(folder.id)}
                    role="menuitem"
                    type="button"
                  >
                    <KindrawIcon name="folder" size={16} /> {folder.name}
                  </button>
                ))}
                {filteredFolders.length === 0 ? (
                  <p className="kindraw-movepop__empty">
                    {t("kindraw.workspace.noFolders")}
                  </p>
                ) : null}
              </div>
              <div className="kindraw-movepop__foot">
                {showNewFolderInput ? (
                  <form
                    className="kindraw-movepop__newrow"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleBulkMoveToNewFolder();
                    }}
                  >
                    <input
                      aria-label={t("kindraw.workspace.newFolderNameAria")}
                      autoFocus
                      className="kindraw-movepop__search"
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder={t("kindraw.workspace.folderNamePlaceholder")}
                      type="text"
                      value={newFolderName}
                    />
                    <button
                      className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
                      disabled={!newFolderName.trim()}
                      type="submit"
                    >
                      {t("kindraw.actions.create")}
                    </button>
                  </form>
                ) : (
                  <button
                    className="kindraw-menu__item"
                    onClick={() => setShowNewFolderInput(true)}
                    role="menuitem"
                    type="button"
                  >
                    <KindrawIcon name="plus" size={16} />{" "}
                    {t("kindraw.workspace.newFolderEllipsis")}
                  </button>
                )}
              </div>
            </div>
          </KindrawMenuWrap>
          <button
            className="kindraw-btn kindraw-btn--danger kindraw-btn--sm"
            disabled={selectedCount === 0}
            onClick={() => void handleBulkDelete()}
            type="button"
          >
            <KindrawIcon name="trash" size={15} /> {t("kindraw.actions.delete")}
          </button>
          <button
            className="kindraw-btn kindraw-btn--ghost kindraw-btn--sm"
            onClick={exitSelection}
            type="button"
          >
            {t("kindraw.actions.cancel")}
          </button>
        </div>
      ) : null}
    </section>
  );
};

/* ────────────────────────────────────────────────────────
   Página pública de share (inalterada)
   ──────────────────────────────────────────────────────── */

const PublicSharePage = ({ token }: { token: string }) => {
  const { t } = useKindrawI18n();
  const [itemResponse, setItemResponse] =
    useState<KindrawPublicItemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const route = matchKindrawRoute(getLocationPathname());

  const loadShare = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await getPublicItem(token, {
        view: route.kind === "share" ? route.view || undefined : undefined,
        sectionId: route.kind === "share" ? route.sectionId : null,
      });
      startTransition(() => {
        setItemResponse(response);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [route, token]);

  useEffect(() => {
    void loadShare();
  }, [loadShare, token]);

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
    <HybridPublicShareView
      itemResponse={itemResponse}
      sectionId={route.kind === "share" ? route.sectionId : null}
      shareToken={token}
      view={route.kind === "share" ? route.view : "both"}
    />
  );
};

const isKindrawDocumentItem = (item: KindrawItem | KindrawHybridItem) =>
  !isKindrawHybridItem(item);

/* ────────────────────────────────────────────────────────
   Landing (logged-out root) — sells the product + holds sign-in.
   Leaf component: only safe primitives (icons, no Excalidraw <Dialog>).
   ──────────────────────────────────────────────────────── */

type WaitlistStatus = "idle" | "loading" | "success" | "error";

const KindrawWaitlistForm = ({ source }: { source: string }) => {
  const { t } = useKindrawI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: ReactFormEvent) => {
      event.preventDefault();
      if (status === "loading") {
        return;
      }
      const value = email.trim();
      if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        setStatus("error");
        setMessage(t("kindraw.landing.waitlist.invalid"));
        return;
      }
      setStatus("loading");
      setMessage(null);
      try {
        await joinWaitlist(value, source);
        setStatus("success");
        setMessage(t("kindraw.landing.waitlist.success"));
        setEmail("");
      } catch (error) {
        setStatus("error");
        setMessage(
          getErrorMessage(error) || t("kindraw.landing.waitlist.error"),
        );
      }
    },
    [email, source, status, t],
  );

  if (status === "success") {
    return (
      <p className="kindraw-landing__waitlist-success" role="status">
        <span className="kindraw-landing__waitlist-check">
          <KindrawIcon name="check" size={15} strokeWidth={2.4} />
        </span>
        {message}
      </p>
    );
  }

  return (
    <form
      className="kindraw-landing__waitlist"
      onSubmit={handleSubmit}
      noValidate
    >
      <label className="kindraw-sr-only" htmlFor="kindraw-waitlist-email">
        {t("kindraw.landing.waitlist.label")}
      </label>
      <div className="kindraw-landing__waitlist-row">
        <input
          aria-describedby={
            status === "error" ? "kindraw-waitlist-status" : undefined
          }
          aria-invalid={status === "error"}
          autoComplete="email"
          className="kindraw-landing__waitlist-input"
          id="kindraw-waitlist-email"
          inputMode="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === "error") {
              setStatus("idle");
              setMessage(null);
            }
          }}
          placeholder={t("kindraw.landing.waitlist.placeholder")}
          type="email"
          value={email}
        />
        <button
          className="kindraw-btn kindraw-btn--soft kindraw-landing__waitlist-btn"
          disabled={status === "loading"}
          type="submit"
        >
          {status === "loading"
            ? t("kindraw.landing.waitlist.loading")
            : t("kindraw.landing.waitlist.cta")}
        </button>
      </div>
      <p
        aria-live="polite"
        className={
          status === "error"
            ? "kindraw-landing__waitlist-msg kindraw-landing__waitlist-msg--error"
            : "kindraw-landing__waitlist-msg"
        }
        id="kindraw-waitlist-status"
      >
        {status === "error" ? message : t("kindraw.landing.waitlist.hint")}
      </p>
    </form>
  );
};

const KindrawLandingValueProp = ({
  icon,
  title,
  body,
}: {
  icon: KindrawIconName;
  title: string;
  body: string;
}) => (
  <article className="kindraw-landing__value">
    <span className="kindraw-landing__value-icon">
      <KindrawIcon name={icon} size={19} strokeWidth={2.1} />
    </span>
    <h3>{title}</h3>
    <p>{body}</p>
  </article>
);

const KindrawLanding = ({ errorMessage }: { errorMessage: string | null }) => {
  const { t } = useKindrawI18n();

  return (
    <div className="kindraw-landing">
      {/* soft paper/grid atmosphere behind the whole page */}
      <div aria-hidden className="kindraw-landing__paper" />

      <header className="kindraw-landing__nav">
        <a className="kindraw-landing__brand" href="/">
          <span className="kindraw-logomark">
            <KindrawIcon name="pen" size={15} strokeWidth={2.1} />
          </span>
          Kindraw
        </a>
        <a className="kindraw-landing__nav-link" href="/public">
          {t("kindraw.login.exploreWithoutAccount")}
        </a>
      </header>

      <main className="kindraw-landing__main">
        {/* ─── HERO ─── */}
        <section className="kindraw-landing__hero">
          <div className="kindraw-landing__hero-copy">
            <span className="kindraw-eyebrow">
              {t("kindraw.landing.hero.eyebrow")}
            </span>
            <h1 className="kindraw-landing__headline">
              {t("kindraw.landing.hero.headlineA")}{" "}
              <span className="kindraw-landing__headline-mark">
                {t("kindraw.landing.hero.headlineMark")}
              </span>{" "}
              {t("kindraw.landing.hero.headlineB")}
            </h1>
            <p className="kindraw-landing__subhead">
              {t("kindraw.landing.hero.subhead")}
            </p>

            <div className="kindraw-landing__cta">
              <button
                className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
                onClick={openGithubLogin}
                type="button"
              >
                <span className="kindraw-provider-glyph kindraw-provider-glyph--github">
                  <KindrawIcon name="github" size={18} />
                </span>
                {t("kindraw.landing.hero.ctaGithub")}
              </button>
              <button
                className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
                onClick={openGoogleLogin}
                type="button"
              >
                <span className="kindraw-provider-glyph kindraw-provider-glyph--google">
                  <GoogleGlyph size={16} />
                </span>
                {t("kindraw.landing.hero.ctaGoogle")}
              </button>
            </div>

            <div className="kindraw-landing__waitlist-block">
              <span className="kindraw-landing__or">
                {t("kindraw.landing.hero.or")}
              </span>
              <KindrawWaitlistForm source="landing-hero" />
            </div>

            {errorMessage ? (
              <p className="kindraw-error-copy">{errorMessage}</p>
            ) : null}
          </div>

          {/* DEMO slot — styled placeholder, sized 16:10 for the future clip */}
          {/* TODO: demo GIF — prompt in Claude Code → diagram → share link → collaborate */}
          <div className="kindraw-landing__demo">
            <div className="kindraw-landing__demo-frame">
              <div className="kindraw-landing__demo-bar" aria-hidden>
                <span className="kindraw-landing__demo-dot" />
                <span className="kindraw-landing__demo-dot" />
                <span className="kindraw-landing__demo-dot" />
                <span className="kindraw-landing__demo-url">
                  kindraw.dev/draw/payments-architecture
                </span>
              </div>
              <div className="kindraw-landing__demo-stage">
                <span className="kindraw-landing__demo-play" aria-hidden>
                  <KindrawIcon name="hybrid" size={26} strokeWidth={1.9} />
                </span>
                <p>{t("kindraw.landing.demo.caption")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── VALUE PROPS ─── */}
        <section
          aria-label={t("kindraw.landing.values.aria")}
          className="kindraw-landing__values"
        >
          <KindrawLandingValueProp
            body={t("kindraw.landing.values.layoutBody")}
            icon="hybrid"
            title={t("kindraw.landing.values.layoutTitle")}
          />
          <KindrawLandingValueProp
            body={t("kindraw.landing.values.workspaceBody")}
            icon="folder"
            title={t("kindraw.landing.values.workspaceTitle")}
          />
          <KindrawLandingValueProp
            body={t("kindraw.landing.values.collabBody")}
            icon="users"
            title={t("kindraw.landing.values.collabTitle")}
          />
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className="kindraw-landing__how">
          <div className="kindraw-landing__how-head">
            <span className="kindraw-eyebrow">
              {t("kindraw.landing.how.eyebrow")}
            </span>
            <h2>{t("kindraw.landing.how.title")}</h2>
          </div>
          <ol className="kindraw-landing__steps">
            <li className="kindraw-landing__step">
              <span className="kindraw-landing__step-n">1</span>
              <div>
                <h3>{t("kindraw.landing.how.step1Title")}</h3>
                <p>{t("kindraw.landing.how.step1Body")}</p>
                <code className="kindraw-landing__code">npx @kindraw/mcp</code>
              </div>
            </li>
            <li className="kindraw-landing__step">
              <span className="kindraw-landing__step-n">2</span>
              <div>
                <h3>{t("kindraw.landing.how.step2Title")}</h3>
                <p>{t("kindraw.landing.how.step2Body")}</p>
              </div>
            </li>
            <li className="kindraw-landing__step">
              <span className="kindraw-landing__step-n">3</span>
              <div>
                <h3>{t("kindraw.landing.how.step3Title")}</h3>
                <p>{t("kindraw.landing.how.step3Body")}</p>
              </div>
            </li>
          </ol>
        </section>

        {/* ─── CLOSING CTA ─── */}
        <section className="kindraw-landing__closer">
          <h2>{t("kindraw.landing.closer.title")}</h2>
          <p>{t("kindraw.landing.closer.subtitle")}</p>
          <div className="kindraw-landing__cta kindraw-landing__cta--center">
            <button
              className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
              onClick={openGithubLogin}
              type="button"
            >
              <span className="kindraw-provider-glyph kindraw-provider-glyph--github">
                <KindrawIcon name="github" size={18} />
              </span>
              {t("kindraw.landing.hero.ctaGithub")}
            </button>
            <a className="kindraw-ghostlink" href="/public">
              {t("kindraw.login.exploreWithoutAccount")}
            </a>
          </div>
          <small className="kindraw-landing__privacy">
            {t("kindraw.login.privacyNote")}
          </small>
        </section>
      </main>

      <footer className="kindraw-landing__footer">
        <div className="kindraw-landing__footer-credit">
          {t("kindraw.landing.footer.builtOn")}{" "}
          <a
            href="https://github.com/excalidraw/excalidraw"
            rel="noreferrer noopener"
            target="_blank"
          >
            Excalidraw
          </a>
          .
        </div>
        <div className="kindraw-landing__footer-dev">
          <span>{t("kindraw.landing.footer.forDevs")}</span>
          <code className="kindraw-landing__code">npx @kindraw/mcp</code>
        </div>
      </footer>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   App
   ──────────────────────────────────────────────────────── */

export const KindrawApp = () => {
  const { t } = useKindrawI18n();
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocationPathname,
    getLocationPathname,
  );
  const route = matchKindrawRoute(pathname);
  const [session, setSession] = useState<KindrawSession | null | undefined>(
    undefined,
  );
  const [tree, setTree] = useState<KindrawWorkspaceTreeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [dialog, setDialog] = useState<KindrawDialog | null>(null);
  const [shareFolder, setShareFolder] = useState<KindrawFolder | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const setSettingsDialogState = useSetAtom(settingsDialogStateAtom);
  const [searchQuery, setSearchQuery] = useState("");
  const [sharedView, setSharedView] = useState<KindrawSharedView>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const itemsById = Object.fromEntries(
    (tree?.items || [])
      .filter(isKindrawDocumentItem)
      .map((item) => [item.id, item]),
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  const refreshTree = useCallback(async () => {
    if (!session) {
      return;
    }

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
  }, [session, t]);

  const loadSession = useCallback(async () => {
    setErrorMessage(null);
    try {
      const nextSession = await getSession();
      startTransition(() => {
        setSession(nextSession);
      });
      if (nextSession) {
        const nextTree = await getWorkspaceTree();
        startTransition(() => {
          setTree(nextTree);
        });
      } else {
        startTransition(() => {
          setTree(null);
        });
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, t("kindraw.status.workspaceLoadFailed")),
      );
      setSession(null);
    }
  }, [t]);

  useEffect(() => {
    if (route.kind !== "share" && typeof session === "undefined") {
      void loadSession();
    }
  }, [loadSession, route.kind, session]);

  useEffect(() => {
    if (
      route.kind === "workspace" &&
      route.folderId &&
      tree &&
      !tree.folders.some((folder) => folder.id === route.folderId)
    ) {
      navigateKindraw("/", { replace: true });
    }
  }, [route, tree]);

  // Limpa thumbnails obsoletas (versões antigas / itens removidos) do cache
  // persistente sempre que a árvore muda.
  useEffect(() => {
    if (tree) {
      pruneKindrawThumbnails(tree.items);
    }
  }, [tree]);

  // ⌘K / Ctrl+K abre o command palette (busca global) — só no workspace.
  useEffect(() => {
    if (route.kind !== "workspace") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route.kind]);

  const runMutation = useCallback(
    async (action: () => Promise<void> | void) => {
      setIsMutating(true);
      setErrorMessage(null);
      try {
        await action();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const navigateToFolder = useCallback((folderId: string | null) => {
    setSharedView(null);
    navigateKindraw(folderId ? buildFolderPath(folderId) : "/");
  }, []);

  const openSharedView = useCallback(
    (view: Exclude<KindrawSharedView, null>) => {
      setSharedView(view);
      navigateKindraw("/");
    },
    [],
  );

  const handleCreateFolder = useCallback(
    (parentId: string | null) => {
      setDialog({
        type: "prompt",
        title: t("kindraw.dialog.newFolderTitle"),
        confirmLabel: t("kindraw.dialog.createFolder"),
        initialValue: "",
        placeholder: t("kindraw.workspace.folderNamePlaceholder"),
        onSubmit: (name) => {
          void runMutation(async () => {
            await createFolder(name, parentId);
            await refreshTree();
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleCreateItem = useCallback(
    (kind: KindrawItemKind, folderId: string | null) => {
      setDialog({
        type: "prompt",
        title:
          kind === "drawing"
            ? t("kindraw.dialog.newDrawingTitle")
            : t("kindraw.dialog.newDocTitle"),
        confirmLabel: t("kindraw.actions.create"),
        initialValue:
          kind === "drawing"
            ? t("kindraw.dialog.newDrawingDefault")
            : t("kindraw.dialog.newDocDefault"),
        placeholder: t("kindraw.dialog.itemTitlePlaceholder"),
        onSubmit: (title) => {
          void runMutation(async () => {
            const response = await createItem({
              kind,
              title,
              folderId,
              content: createInitialItemContent(kind, title),
            });
            await refreshTree();
            const itemPath = buildItemPath({
              id: response.itemId,
              kind,
            });
            if (kind === "drawing") {
              window.location.assign(itemPath);
            } else {
              navigateKindraw(itemPath);
            }
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleCreateHybridItem = useCallback(
    (folderId: string | null) => {
      setDialog({
        type: "prompt",
        title: t("kindraw.dialog.newHybridTitle"),
        confirmLabel: t("kindraw.actions.create"),
        initialValue: t("kindraw.dialog.newHybridDefault"),
        placeholder: t("kindraw.dialog.hybridTitlePlaceholder"),
        onSubmit: (title) => {
          void runMutation(async () => {
            const response = await createHybridItem({
              title,
              folderId,
            });
            await refreshTree();
            navigateKindraw(
              buildHybridPath(response.hybridId, {
                view: "both",
              }),
            );
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleRenameFolder = useCallback(
    (folder: KindrawFolder) => {
      setDialog({
        type: "prompt",
        title: t("kindraw.actions.renameFolder"),
        confirmLabel: t("kindraw.actions.save"),
        initialValue: folder.name,
        placeholder: t("kindraw.workspace.folderNamePlaceholder"),
        onSubmit: (nextName) => {
          if (nextName === folder.name) {
            return;
          }
          void runMutation(async () => {
            await renameFolder(folder.id, nextName);
            await refreshTree();
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleDeleteFolder = useCallback(
    (folder: KindrawFolder) => {
      setDialog({
        type: "confirm",
        title: t("kindraw.actions.deleteFolder"),
        message: t("kindraw.dialog.deleteFolderMessage", { name: folder.name }),
        confirmLabel: t("kindraw.actions.delete"),
        onConfirm: () => {
          void runMutation(async () => {
            await deleteFolder(folder.id);
            await refreshTree();
            if (route.kind === "workspace" && route.folderId === folder.id) {
              navigateKindraw("/", { replace: true });
            }
          });
        },
      });
    },
    [refreshTree, route, runMutation, t],
  );

  const handleShareFolder = useCallback((folder: KindrawFolder) => {
    // Só o dono compartilha — pastas compartilhadas comigo não abrem o modal.
    if (folder.shared) {
      return;
    }
    setShareFolder(folder);
  }, []);

  const handleRenameItem = useCallback(
    (item: KindrawItem) => {
      setDialog({
        type: "prompt",
        title: t("kindraw.dialog.renameItemTitle"),
        confirmLabel: t("kindraw.actions.save"),
        initialValue: item.title,
        placeholder: t("kindraw.dialog.itemTitlePlaceholder"),
        onSubmit: (nextTitle) => {
          if (nextTitle === item.title) {
            return;
          }
          void runMutation(async () => {
            await updateItemMeta(item.id, { title: nextTitle });
            await refreshTree();
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleDeleteItem = useCallback(
    (item: KindrawItem) => {
      setDialog({
        type: "confirm",
        title: t("kindraw.dialog.deleteItemTitle"),
        message: t("kindraw.dialog.deleteItemMessage", { title: item.title }),
        confirmLabel: t("kindraw.actions.delete"),
        onConfirm: () => {
          void runMutation(async () => {
            await deleteItem(item.id);
            await refreshTree();
            if (
              (route.kind === "drawing" || route.kind === "doc") &&
              route.itemId === item.id
            ) {
              navigateKindraw(buildFolderPath(item.folderId), {
                replace: true,
              });
            }
          });
        },
      });
    },
    [refreshTree, route, runMutation, t],
  );

  const handleConvertItemToHybrid = useCallback(
    (item: KindrawItem) => {
      if (item.kind !== "drawing") {
        return;
      }
      setDialog({
        type: "confirm",
        title: t("kindraw.actions.convertToHybrid"),
        message: t("kindraw.dialog.convertToHybridMessage", {
          title: item.title,
        }),
        confirmLabel: t("kindraw.actions.convert"),
        onConfirm: () => {
          void runMutation(async () => {
            const response = await convertDrawingToHybrid(item.id);
            await refreshTree();
            navigateKindraw(
              buildHybridPath(response.hybridId, {
                view: "both",
              }),
            );
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleRenameHybridItem = useCallback(
    (item: KindrawHybridItem) => {
      setDialog({
        type: "prompt",
        title: t("kindraw.dialog.renameHybridTitle"),
        confirmLabel: t("kindraw.actions.save"),
        initialValue: item.title,
        placeholder: t("kindraw.dialog.hybridTitlePlaceholder"),
        onSubmit: (nextTitle) => {
          if (nextTitle === item.title) {
            return;
          }
          void runMutation(async () => {
            await updateHybridItemMeta(item.id, { title: nextTitle });
            await refreshTree();
          });
        },
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleDeleteHybridItem = useCallback(
    (item: KindrawHybridItem) => {
      setDialog({
        type: "confirm",
        title: t("kindraw.dialog.unlinkHybridTitle"),
        message: t("kindraw.dialog.unlinkHybridMessage", { title: item.title }),
        confirmLabel: t("kindraw.actions.unlink"),
        onConfirm: () => {
          void runMutation(async () => {
            await deleteHybridItem(item.id);
            await refreshTree();
            if (route.kind === "hybrid" && route.hybridId === item.id) {
              navigateKindraw(buildFolderPath(item.folderId), {
                replace: true,
              });
            }
          });
        },
      });
    },
    [refreshTree, route, runMutation, t],
  );

  const handleBulkDelete = useCallback(
    (items: KindrawTreeItem[]) => {
      if (!items.length) {
        return Promise.resolve();
      }
      const hasHybrid = items.some(isKindrawHybridItem);
      return new Promise<void>((resolve) => {
        setDialog({
          type: "confirm",
          title: t("kindraw.dialog.deleteItemsTitle"),
          message: hasHybrid
            ? tCount("kindraw.dialog.bulkDeleteWithHybridMessage", items.length)
            : tCount("kindraw.dialog.bulkDeleteMessage", items.length),
          confirmLabel: t("kindraw.actions.delete"),
          onConfirm: () => {
            void runMutation(async () => {
              await Promise.all(
                items.map((item) =>
                  isKindrawHybridItem(item)
                    ? deleteHybridItem(item.id)
                    : deleteItem(item.id),
                ),
              );
              await refreshTree();
            }).finally(resolve);
          },
        });
      });
    },
    [refreshTree, runMutation, t],
  );

  const handleBulkMove = useCallback(
    (items: KindrawTreeItem[], folderId: string | null) => {
      if (!items.length) {
        return Promise.resolve();
      }
      return runMutation(async () => {
        await Promise.all(
          items.map((item) =>
            isKindrawHybridItem(item)
              ? updateHybridItemMeta(item.id, { folderId })
              : updateItemMeta(item.id, { folderId }),
          ),
        );
        await refreshTree();
      });
    },
    [refreshTree, runMutation],
  );

  const handleBulkMoveToNewFolder = useCallback(
    (items: KindrawTreeItem[], name: string, parentId: string | null) => {
      if (!items.length) {
        return Promise.resolve();
      }
      return runMutation(async () => {
        const { folderId } = await createFolder(name, parentId);
        await Promise.all(
          items.map((item) =>
            isKindrawHybridItem(item)
              ? updateHybridItemMeta(item.id, { folderId })
              : updateItemMeta(item.id, { folderId }),
          ),
        );
        await refreshTree();
      });
    },
    [refreshTree, runMutation],
  );

  const handleLogout = useCallback(async () => {
    await runMutation(async () => {
      await logout();
      setSession(null);
      setTree(null);
      navigateKindraw("/", { replace: true });
    });
  }, [runMutation]);

  if (route.kind === "share") {
    return <PublicSharePage token={route.token} />;
  }

  if (typeof session === "undefined") {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.status.loadingKindraw")}</p>
      </div>
    );
  }

  if (!session) {
    return <KindrawLanding errorMessage={errorMessage} />;
  }

  if (!tree) {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.sidebar.loadingWorkspaceTree")}</p>
      </div>
    );
  }

  const currentFolderId =
    route.kind === "workspace" && !sharedView ? route.folderId : null;
  const itemCounts = countItemsByFolder(tree.items);
  const publicLinksCount = tree.items.filter(
    (item) => item.shareLinks.length > 0,
  ).length;
  const sharedWithMeCount = tree.folders.filter(
    (folder) => folder.shared,
  ).length;
  const isWorkspaceRoute = route.kind === "workspace";

  return (
    <div className="kindraw-shell">
      <header className="kindraw-topbar">
        <a className="kindraw-topbar__logo" href="/">
          <span className="kindraw-logomark">
            <KindrawIcon name="pen" size={15} strokeWidth={2.1} />
          </span>
          Kindraw
        </a>
        <div className="kindraw-search">
          <KindrawIcon name="search" size={15} />
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("kindraw.topbar.searchPlaceholder")}
            ref={searchInputRef}
            type="search"
            value={searchQuery}
          />
          <button
            aria-label={t("kindraw.topbar.openGlobalSearchAria")}
            className="kindraw-kbd kindraw-kbd--button"
            onClick={() => setPaletteOpen(true)}
            type="button"
          >
            ⌘K
          </button>
        </div>
        <KindrawMenuWrap
          button={
            <button
              aria-expanded={avatarMenuOpen}
              className="kindraw-userbutton"
              onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
              type="button"
            >
              {session.user.avatarUrl ? (
                <img alt={session.user.name} src={session.user.avatarUrl} />
              ) : (
                <span className="kindraw-avatar-fallback">
                  {session.user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span>
                <strong>{session.user.name}</strong>
                <span>@{userHandle(session.user)}</span>
              </span>
            </button>
          }
          onClose={() => setAvatarMenuOpen(false)}
          open={avatarMenuOpen}
        >
          <div className="kindraw-menu__header">
            <strong>{session.user.name}</strong>
            <span>@{userHandle(session.user)}</span>
          </div>
          <button
            className="kindraw-menu__item"
            onClick={() => {
              setAvatarMenuOpen(false);
              setSettingsDialogState({ isOpen: true });
            }}
            role="menuitem"
            type="button"
          >
            <KindrawIcon name="settings" size={15} />
            {t("kindraw.settings.title")}
          </button>
          <button
            className="kindraw-menu__item"
            disabled={isMutating}
            onClick={() => {
              setAvatarMenuOpen(false);
              void handleLogout();
            }}
            role="menuitem"
            type="button"
          >
            {t("kindraw.actions.signOut")}
          </button>
        </KindrawMenuWrap>
      </header>

      <div className="kindraw-shell__body">
        <aside className="kindraw-sidebar">
          <div className="kindraw-sidebar__label">
            {t("kindraw.sidebar.workspace")}
          </div>
          <button
            className={`kindraw-tree__button${
              isWorkspaceRoute && !sharedView && route.folderId === null
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => navigateToFolder(null)}
            type="button"
          >
            <KindrawIcon name="home" size={16} />
            <span className="kindraw-tree__label">
              {t("kindraw.sidebar.library")}
            </span>
          </button>
          <FolderTree
            currentFolderId={currentFolderId}
            folders={tree.folders}
            itemCounts={itemCounts}
            onNavigate={(folderId) => navigateToFolder(folderId)}
            parentId={null}
          />
          <button
            className="kindraw-tree__button kindraw-tree__button--ghost"
            onClick={() => handleCreateFolder(currentFolderId)}
            type="button"
          >
            <KindrawIcon name="plus" size={15} />
            <span className="kindraw-tree__label">
              {t("kindraw.actions.newFolder")}
            </span>
          </button>

          <div className="kindraw-sidebar__label">
            {t("kindraw.sidebar.sharedSection")}
          </div>
          <button
            className={`kindraw-tree__button${
              isWorkspaceRoute && sharedView === "shared-with-me"
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => openSharedView("shared-with-me")}
            type="button"
          >
            <KindrawIcon name="users" size={16} />
            <span className="kindraw-tree__label">
              {t("kindraw.sidebar.sharedWithMe")}
            </span>
            <em className="kindraw-tree__count">{sharedWithMeCount}</em>
          </button>
          <button
            className={`kindraw-tree__button${
              isWorkspaceRoute && sharedView === "links"
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => openSharedView("links")}
            type="button"
          >
            <KindrawIcon name="link" size={16} />
            <span className="kindraw-tree__label">
              {t("kindraw.sidebar.publicLinks")}
            </span>
            <em className="kindraw-tree__count">{publicLinksCount}</em>
          </button>
          <button
            className={`kindraw-tree__button${
              isWorkspaceRoute && sharedView === "live"
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => openSharedView("live")}
            type="button"
          >
            <KindrawIcon name="users" size={16} />
            <span className="kindraw-tree__label">
              {t("kindraw.sidebar.liveSessions")}
            </span>
          </button>
        </aside>

        <main
          className={`kindraw-main${
            route.kind === "drawing" ||
            route.kind === "doc" ||
            route.kind === "hybrid"
              ? " kindraw-main--editor"
              : ""
          }`}
        >
          {errorMessage ? (
            <p className="kindraw-error-banner">{errorMessage}</p>
          ) : null}
          {route.kind === "workspace" ? (
            <WorkspacePage
              currentFolderId={currentFolderId}
              onBulkDelete={handleBulkDelete}
              onBulkMove={handleBulkMove}
              onBulkMoveToNewFolder={handleBulkMoveToNewFolder}
              onCreateHybridItem={handleCreateHybridItem}
              onCreateFolder={handleCreateFolder}
              onCreateItem={handleCreateItem}
              onDeleteHybridItem={handleDeleteHybridItem}
              onDeleteFolder={handleDeleteFolder}
              onDeleteItem={handleDeleteItem}
              onNavigateFolder={navigateToFolder}
              onNavigateSharedWithMe={() => openSharedView("shared-with-me")}
              onRenameHybridItem={handleRenameHybridItem}
              onRenameFolder={handleRenameFolder}
              onRenameItem={handleRenameItem}
              onConvertItemToHybrid={handleConvertItemToHybrid}
              onShareFolder={handleShareFolder}
              searchQuery={searchQuery}
              sharedView={sharedView}
              tree={tree}
            />
          ) : route.kind === "hybrid" ? (
            <HybridEditorPage
              currentUser={session?.user ?? null}
              folders={tree.folders}
              hybridId={route.hybridId}
              initialSectionId={route.sectionId}
              initialView={route.view}
              itemsById={itemsById}
              onTreeRefresh={refreshTree}
            />
          ) : route.kind === "drawing" ? (
            <DrawingEditorPage
              folders={tree.folders}
              itemId={route.itemId}
              onTreeRefresh={refreshTree}
            />
          ) : route.kind === "doc" ? (
            <DocEditorPage
              folders={tree.folders}
              itemId={route.itemId}
              onTreeRefresh={refreshTree}
            />
          ) : null}
        </main>
      </div>

      {dialog ? (
        <KindrawDialogModal
          dialog={dialog}
          key={
            dialog.title + (dialog.type === "prompt" ? dialog.initialValue : "")
          }
          onClose={closeDialog}
        />
      ) : null}

      {shareFolder ? (
        <ShareFolderModal
          folder={shareFolder}
          key={shareFolder.id}
          onChange={() => void refreshTree()}
          onClose={() => setShareFolder(null)}
        />
      ) : null}

      <KindrawCommandPalette
        folders={tree.folders}
        items={tree.items}
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />

      <SettingsDialog />
    </div>
  );
};
