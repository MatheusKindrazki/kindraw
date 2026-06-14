import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
  useSyncExternalStore,
} from "react";

import {
  createHybridItem,
  createFolder,
  createItem,
  deleteHybridItem,
  deleteFolder,
  deleteItem,
  getPublicItem,
  getSession,
  getWorkspaceTree,
  logout,
  openGithubLogin,
  renameFolder,
  updateHybridItemMeta,
  updateItemMeta,
} from "./api";
import { DocEditorPage } from "./DocEditorPage";
import { DrawingEditorPage } from "./DrawingEditorPage";
import { HybridEditorPage } from "./HybridEditorPage";
import { HybridPublicShareView } from "./HybridPublicShareView";
import { ShareFolderModal } from "./ShareFolderModal";
import { KindrawIcon } from "./icons";
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

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

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
  new Date(updatedAt).toLocaleString("pt-BR", {
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

const relativeTimeFormatter = new Intl.RelativeTimeFormat("pt-BR", {
  numeric: "auto",
});

const formatRelativeTime = (updatedAt: string) => {
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

const pluralize = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

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

const KIND_LABEL: Record<string, string> = {
  drawing: "Drawing",
  doc: "Doc",
  hybrid: "Híbrido",
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
            Cancelar
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
      return "Raiz";
    }
    const trail = getFolderTrail(folders, folderId);
    return trail.length ? trail[trail.length - 1].name : "Raiz";
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
            aria-label="Buscar em todo o workspace"
            aria-controls="kindraw-cmdk-list"
            autoComplete="off"
            className="kindraw-cmdk__input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar em todo o workspace…"
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
                    {KIND_LABEL[kindKey]}
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
              ? "Nenhum item encontrado."
              : "Nenhum item no workspace ainda."}
          </div>
        )}

        <div className="kindraw-cmdk__foot">
          ↑↓ navegar · ↵ abrir · esc fechar
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
          <span className="kindraw-card__thumb-empty">Vazio</span>
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
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  readOnly?: boolean;
}) => {
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
            ? `${selected ? "Desmarcar" : "Selecionar"} ${item.title}`
            : `Abrir ${item.title}`
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
            {KIND_LABEL[kindKey]}
          </span>
          <span className="kindraw-card__topright">
            {readOnly ? (
              <span className="kindraw-card__readonly" title="Somente leitura">
                <KindrawIcon name="users" size={13} /> leitura
              </span>
            ) : null}
            {item.shareLinks.length ? (
              <span className="kindraw-card__shared">
                <KindrawIcon name="link" size={13} /> público
              </span>
            ) : null}
            {selectionMode || readOnly ? null : (
              <KindrawMenuWrap
                button={
                  <button
                    aria-expanded={menuOpen}
                    aria-label={`Ações de ${item.title}`}
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
                  Renomear
                </button>
                <button
                  className="kindraw-menu__item kindraw-menu__item--danger"
                  onClick={() => {
                    onCloseMenu();
                    onDelete();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {isKindrawHybridItem(item) ? "Desvincular" : "Excluir"}
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
      ? "Links públicos"
      : sharedView === "live"
      ? "Sessões ao vivo"
      : "Compartilhados comigo"
    : currentFolder?.name || "Biblioteca";

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
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
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
          <nav aria-label="Caminho" className="kindraw-crumb">
            {sharedView ? (
              <span>Compartilhados</span>
            ) : isSharedFolder ? (
              <>
                <button onClick={() => onNavigateSharedWithMe()} type="button">
                  Compartilhados comigo
                </button>
                {currentFolder ? <span>/ {currentFolder.name}</span> : null}
              </>
            ) : (
              <>
                <button onClick={() => onNavigateFolder(null)} type="button">
                  Raiz
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
                button={
                  <button
                    aria-expanded={openMenuId === "current-folder"}
                    aria-label="Ações da pasta atual"
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
                  Compartilhar
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
                  Renomear pasta
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
                  Excluir pasta
                </button>
              </KindrawMenuWrap>
            ) : null}
            {currentFolder?.shared ? (
              <span
                className={`kindraw-sharebadge${
                  isReadOnlyFolder ? " kindraw-sharebadge--viewer" : ""
                }`}
              >
                <KindrawIcon name="users" size={13} /> de @
                {currentFolder.shared.ownerLogin} ·{" "}
                {isReadOnlyFolder ? "Visualizador" : "Editor"}
              </span>
            ) : null}
          </div>
          <p className="kindraw-main-head__meta">
            {sharedView === "shared-with-me"
              ? pluralize(visibleFolders.length, "pasta", "pastas")
              : sharedView
              ? pluralize(visibleItems.length, "item", "itens")
              : isSharedFolder
              ? pluralize(visibleItems.length, "item", "itens")
              : `${pluralize(
                  visibleFolders.length,
                  "pasta",
                  "pastas",
                )} · ${pluralize(visibleItems.length, "item", "itens")}`}
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
              <KindrawIcon name="close" size={16} /> Cancelar seleção
            </button>
          ) : (
            <>
              {canSelect ? (
                <button
                  className="kindraw-btn kindraw-btn--soft"
                  onClick={() => setSelectionMode(true)}
                  type="button"
                >
                  <KindrawIcon name="check" size={16} /> Selecionar
                </button>
              ) : null}
              <button
                className="kindraw-btn kindraw-btn--soft"
                onClick={() => onCreateFolder(currentFolderId)}
                type="button"
              >
                <KindrawIcon name="folder" size={16} /> Nova pasta
              </button>
              <KindrawMenuWrap
                button={
                  <button
                    aria-expanded={newMenuOpen}
                    className="kindraw-btn kindraw-btn--primary"
                    onClick={() => setNewMenuOpen(!newMenuOpen)}
                    type="button"
                  >
                    <KindrawIcon name="plus" size={16} /> Novo{" "}
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
                  <KindrawIcon name="pen" size={16} /> Drawing
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
                  <KindrawIcon name="doc" size={16} /> Doc
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
                  <KindrawIcon name="hybrid" size={16} /> Híbrido
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
                      de @{folder.shared.ownerLogin} ·{" "}
                      {folder.shared.role === "viewer"
                        ? "Visualizador"
                        : "Editor"}
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
                      aria-label={`Ações da pasta ${folder.name}`}
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
                    Compartilhar
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
                    Renomear
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
                    Excluir
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
            ? "Nenhum item corresponde à busca."
            : sharedView === "links"
            ? "Nenhum item com link público ainda."
            : sharedView === "live"
            ? "Nenhuma sessão ao vivo ativa."
            : sharedView === "shared-with-me"
            ? "Nenhuma pasta foi compartilhada com você ainda."
            : "Nenhum drawing, doc ou híbrido nesta pasta."}
        </p>
      )}

      {selectionMode ? (
        <div
          className="kindraw-bulkbar"
          role="toolbar"
          aria-label="Ações em massa"
        >
          <span className="kindraw-bulkbar__count">
            {pluralize(selectedCount, "selecionado", "selecionados")}
          </span>
          <button
            className="kindraw-btn kindraw-btn--ghost kindraw-btn--sm"
            onClick={toggleSelectAll}
            type="button"
          >
            {allSelected ? "Limpar seleção" : "Selecionar todos"}
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
                <KindrawIcon name="move" size={15} /> Mover para pasta
              </button>
            }
            onClose={() => setMoveOpen(false)}
            open={moveOpen}
          >
            <div className="kindraw-movepop">
              <input
                aria-label="Buscar pasta"
                className="kindraw-movepop__search"
                onChange={(event) => setFolderQuery(event.target.value)}
                placeholder="Buscar pasta…"
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
                  <KindrawIcon name="home" size={16} /> Raiz (sem pasta)
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
                  <p className="kindraw-movepop__empty">Nenhuma pasta.</p>
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
                      aria-label="Nome da nova pasta"
                      autoFocus
                      className="kindraw-movepop__search"
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder="Nome da pasta"
                      type="text"
                      value={newFolderName}
                    />
                    <button
                      className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
                      disabled={!newFolderName.trim()}
                      type="submit"
                    >
                      Criar
                    </button>
                  </form>
                ) : (
                  <button
                    className="kindraw-menu__item"
                    onClick={() => setShowNewFolderInput(true)}
                    role="menuitem"
                    type="button"
                  >
                    <KindrawIcon name="plus" size={16} /> Nova pasta…
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
            <KindrawIcon name="trash" size={15} /> Excluir
          </button>
          <button
            className="kindraw-btn kindraw-btn--ghost kindraw-btn--sm"
            onClick={exitSelection}
            type="button"
          >
            Cancelar
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
          <h2>Link publico invalido</h2>
          <p>{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (!itemResponse) {
    return (
      <div className="kindraw-share-shell">
        <p className="kindraw-loading-shell">Carregando link publico...</p>
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
   App
   ──────────────────────────────────────────────────────── */

export const KindrawApp = () => {
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
      setErrorMessage(getErrorMessage(error, "Falha ao atualizar a arvore."));
    }
  }, [session]);

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
      setErrorMessage(getErrorMessage(error, "Falha ao carregar a sessao."));
      setSession(null);
    }
  }, []);

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
        title: "Nova pasta",
        confirmLabel: "Criar pasta",
        initialValue: "",
        placeholder: "Nome da pasta",
        onSubmit: (name) => {
          void runMutation(async () => {
            await createFolder(name, parentId);
            await refreshTree();
          });
        },
      });
    },
    [refreshTree, runMutation],
  );

  const handleCreateItem = useCallback(
    (kind: KindrawItemKind, folderId: string | null) => {
      setDialog({
        type: "prompt",
        title: kind === "drawing" ? "Novo drawing" : "Novo doc",
        confirmLabel: "Criar",
        initialValue:
          kind === "drawing" ? "Novo drawing" : "Nova nota markdown",
        placeholder: "Título do item",
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
    [refreshTree, runMutation],
  );

  const handleCreateHybridItem = useCallback(
    (folderId: string | null) => {
      setDialog({
        type: "prompt",
        title: "Novo híbrido",
        confirmLabel: "Criar",
        initialValue: "Nova nota visual",
        placeholder: "Título do híbrido",
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
    [refreshTree, runMutation],
  );

  const handleRenameFolder = useCallback(
    (folder: KindrawFolder) => {
      setDialog({
        type: "prompt",
        title: "Renomear pasta",
        confirmLabel: "Salvar",
        initialValue: folder.name,
        placeholder: "Nome da pasta",
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
    [refreshTree, runMutation],
  );

  const handleDeleteFolder = useCallback(
    (folder: KindrawFolder) => {
      setDialog({
        type: "confirm",
        title: "Excluir pasta",
        message: `Excluir a pasta "${folder.name}"?`,
        confirmLabel: "Excluir",
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
    [refreshTree, route, runMutation],
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
        title: "Renomear item",
        confirmLabel: "Salvar",
        initialValue: item.title,
        placeholder: "Título do item",
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
    [refreshTree, runMutation],
  );

  const handleDeleteItem = useCallback(
    (item: KindrawItem) => {
      setDialog({
        type: "confirm",
        title: "Excluir item",
        message: `Excluir "${item.title}"?`,
        confirmLabel: "Excluir",
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
    [refreshTree, route, runMutation],
  );

  const handleRenameHybridItem = useCallback(
    (item: KindrawHybridItem) => {
      setDialog({
        type: "prompt",
        title: "Renomear híbrido",
        confirmLabel: "Salvar",
        initialValue: item.title,
        placeholder: "Título do híbrido",
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
    [refreshTree, runMutation],
  );

  const handleDeleteHybridItem = useCallback(
    (item: KindrawHybridItem) => {
      setDialog({
        type: "confirm",
        title: "Desvincular híbrido",
        message: `Desvincular "${item.title}"? O doc e o canvas continuam como itens separados.`,
        confirmLabel: "Desvincular",
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
    [refreshTree, route, runMutation],
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
          title: "Excluir itens",
          message: hasHybrid
            ? `Excluir ${items.length} ${
                items.length === 1 ? "item" : "itens"
              }? Híbridos serão desvinculados.`
            : `Excluir ${items.length} ${
                items.length === 1 ? "item" : "itens"
              }?`,
          confirmLabel: "Excluir",
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
    [refreshTree, runMutation],
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
        <p>Carregando Kindraw...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-logomark kindraw-logomark--lg">
            <KindrawIcon name="pen" size={22} strokeWidth={2.1} />
          </span>
          <span className="kindraw-eyebrow">Kindraw</span>
          <h1>Desenhe. Documente. Compartilhe.</h1>
          <p>
            Seu workspace de drawings, docs e híbridos — com pastas, autosave e
            links públicos.
          </p>
          <button
            className="kindraw-btn kindraw-btn--primary kindraw-btn--github"
            onClick={openGithubLogin}
            type="button"
          >
            <KindrawIcon name="github" size={18} /> Continuar com GitHub
          </button>
          <a className="kindraw-ghostlink" href="/public">
            Explorar sem conta
          </a>
          <small>
            Usamos seu GitHub apenas para login e presença em sessões ao vivo.
          </small>
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
        <p>Carregando arvore do workspace...</p>
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
            placeholder="Buscar drawings, docs e híbridos…"
            ref={searchInputRef}
            type="search"
            value={searchQuery}
          />
          <button
            aria-label="Abrir busca global (⌘K)"
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
                <span>@{session.user.githubLogin}</span>
              </span>
            </button>
          }
          onClose={() => setAvatarMenuOpen(false)}
          open={avatarMenuOpen}
        >
          <div className="kindraw-menu__header">
            <strong>{session.user.name}</strong>
            <span>@{session.user.githubLogin}</span>
          </div>
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
            Sair
          </button>
        </KindrawMenuWrap>
      </header>

      <div className="kindraw-shell__body">
        <aside className="kindraw-sidebar">
          <div className="kindraw-sidebar__label">Workspace</div>
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
            <span className="kindraw-tree__label">Biblioteca</span>
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
            <span className="kindraw-tree__label">Nova pasta</span>
          </button>

          <div className="kindraw-sidebar__label">Compartilhados</div>
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
            <span className="kindraw-tree__label">Compartilhados comigo</span>
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
            <span className="kindraw-tree__label">Links públicos</span>
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
            <span className="kindraw-tree__label">Sessões ao vivo</span>
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
              onShareFolder={handleShareFolder}
              searchQuery={searchQuery}
              sharedView={sharedView}
              tree={tree}
            />
          ) : route.kind === "hybrid" ? (
            <HybridEditorPage
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
    </div>
  );
};
