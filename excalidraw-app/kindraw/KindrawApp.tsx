import {
  useCallback,
  useEffect,
  useState,
  startTransition,
  useSyncExternalStore,
} from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

import {
  createFolder,
  createItem,
  deleteFolder,
  deleteItem,
  getPublicItem,
  getSession,
  getTree,
  logout,
  openGithubLogin,
  renameFolder,
  updateItemMeta,
} from "./api";
import { DocEditorPage } from "./DocEditorPage";
import { DrawingEditorPage } from "./DrawingEditorPage";
import { createInitialItemContent, parseDrawingContent } from "./content";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  buildFolderPath,
  buildItemPath,
  getLocationPathname,
  matchKindrawRoute,
  navigateKindraw,
  subscribeToLocation,
} from "./router";
import { getErrorMessage } from "./utils";

import "./kindraw.scss";

import type {
  KindrawFolder,
  KindrawItem,
  KindrawItemKind,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawTreeResponse,
} from "./types";

const formatUpdatedAt = (updatedAt: string) =>
  new Date(updatedAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

const promptForName = (label: string, initialValue = "") => {
  const value = window.prompt(label, initialValue)?.trim();
  return value || null;
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
    <ul className="kindraw-tree">
      {children.map((folder) => (
        <li key={folder.id}>
          <button
            className={`kindraw-tree__button${
              currentFolderId === folder.id
                ? " kindraw-tree__button--active"
                : ""
            }`}
            onClick={() => navigateKindraw(buildFolderPath(folder.id))}
            type="button"
          >
            {folder.name}
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

const WorkspacePage = ({
  currentFolderId,
  tree,
  onCreateFolder,
  onCreateItem,
  onDeleteFolder,
  onDeleteItem,
  onRenameFolder,
  onRenameItem,
}: {
  currentFolderId: string | null;
  tree: KindrawTreeResponse;
  onCreateFolder: (parentId: string | null) => Promise<void> | void;
  onCreateItem: (
    kind: KindrawItemKind,
    folderId: string | null,
  ) => Promise<void> | void;
  onDeleteFolder: (folder: KindrawFolder) => Promise<void> | void;
  onDeleteItem: (item: KindrawItem) => Promise<void> | void;
  onRenameFolder: (folder: KindrawFolder) => Promise<void> | void;
  onRenameItem: (item: KindrawItem) => Promise<void> | void;
}) => {
  const currentFolder =
    tree.folders.find((folder) => folder.id === currentFolderId) || null;
  const visibleFolders = getFolderChildren(tree.folders, currentFolderId);
  const visibleItems = tree.items.filter(
    (item) => item.folderId === currentFolderId,
  );
  const folderTrail = getFolderTrail(tree.folders, currentFolderId);

  return (
    <section className="kindraw-workspace">
      <header className="kindraw-workspace__header">
        <div>
          <span className="kindraw-eyebrow">Workspace</span>
          <h1>{currentFolder?.name || "Biblioteca"}</h1>
          <p>
            {visibleFolders.length} pastas, {visibleItems.length} itens
          </p>
        </div>
        <div className="kindraw-toolbar">
          <button
            className="kindraw-button"
            onClick={() => void onCreateFolder(currentFolderId)}
            type="button"
          >
            Nova pasta
          </button>
          <button
            className="kindraw-button kindraw-button--secondary"
            onClick={() => void onCreateItem("drawing", currentFolderId)}
            type="button"
          >
            Novo drawing
          </button>
          <button
            className="kindraw-button kindraw-button--secondary"
            onClick={() => void onCreateItem("doc", currentFolderId)}
            type="button"
          >
            Novo doc
          </button>
        </div>
      </header>

      <nav className="kindraw-breadcrumbs">
        <button
          className="kindraw-link-button"
          onClick={() => navigateKindraw("/")}
          type="button"
        >
          Raiz
        </button>
        {folderTrail.map((folder) => (
          <button
            className="kindraw-link-button"
            key={folder.id}
            onClick={() => navigateKindraw(buildFolderPath(folder.id))}
            type="button"
          >
            / {folder.name}
          </button>
        ))}
      </nav>

      {currentFolder ? (
        <div className="kindraw-inline-actions">
          <button
            className="kindraw-link-button"
            onClick={() => void onRenameFolder(currentFolder)}
            type="button"
          >
            Renomear pasta atual
          </button>
          <button
            className="kindraw-link-button kindraw-link-button--danger"
            onClick={() => void onDeleteFolder(currentFolder)}
            type="button"
          >
            Excluir pasta atual
          </button>
        </div>
      ) : null}

      <section className="kindraw-section">
        <div className="kindraw-section__header">
          <h2>Pastas</h2>
        </div>
        {visibleFolders.length ? (
          <div className="kindraw-card-grid">
            {visibleFolders.map((folder) => (
              <article className="kindraw-folder-card" key={folder.id}>
                <button
                  className="kindraw-folder-card__title"
                  onClick={() => navigateKindraw(buildFolderPath(folder.id))}
                  type="button"
                >
                  {folder.name}
                </button>
                <div className="kindraw-folder-card__meta">
                  Atualizada em {formatUpdatedAt(folder.updatedAt)}
                </div>
                <div className="kindraw-inline-actions">
                  <button
                    className="kindraw-link-button"
                    onClick={() => void onRenameFolder(folder)}
                    type="button"
                  >
                    Renomear
                  </button>
                  <button
                    className="kindraw-link-button kindraw-link-button--danger"
                    onClick={() => void onDeleteFolder(folder)}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="kindraw-section__empty">Nenhuma pasta aqui ainda.</p>
        )}
      </section>

      <section className="kindraw-section">
        <div className="kindraw-section__header">
          <h2>Itens</h2>
        </div>
        {visibleItems.length ? (
          <div className="kindraw-card-grid">
            {visibleItems.map((item) => (
              <article className="kindraw-item-card" key={item.id}>
                <div className="kindraw-item-card__header">
                  <span className="kindraw-badge">{item.kind}</span>
                  <span className="kindraw-item-card__date">
                    {formatUpdatedAt(item.updatedAt)}
                  </span>
                </div>
                <button
                  className="kindraw-item-card__title"
                  onClick={() => navigateKindraw(buildItemPath(item))}
                  type="button"
                >
                  {item.title}
                </button>
                <div className="kindraw-item-card__meta">
                  {item.shareLinks.length
                    ? `${item.shareLinks.length} link(s) publicos`
                    : "Privado"}
                </div>
                <div className="kindraw-inline-actions">
                  <button
                    className="kindraw-link-button"
                    onClick={() => void onRenameItem(item)}
                    type="button"
                  >
                    Renomear
                  </button>
                  <button
                    className="kindraw-link-button kindraw-link-button--danger"
                    onClick={() => void onDeleteItem(item)}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="kindraw-section__empty">
            Nenhum drawing ou doc nesta pasta.
          </p>
        )}
      </section>
    </section>
  );
};

const PublicSharePage = ({ token }: { token: string }) => {
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
    <div className="kindraw-share-shell">
      <header className="kindraw-share-shell__header">
        <div>
          <span className="kindraw-eyebrow">Link publico</span>
          <h1>{itemResponse.item.title}</h1>
          <p>Somente leitura</p>
        </div>
        <a className="kindraw-link-button" href="/">
          Abrir Kindraw
        </a>
      </header>

      {itemResponse.item.kind === "doc" ? (
        <section className="kindraw-share-shell__content">
          <MarkdownPreview markdown={itemResponse.content} />
        </section>
      ) : (
        <section className="kindraw-share-shell__canvas">
          <Excalidraw
            initialData={parseDrawingContent(itemResponse.content)}
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
            viewModeEnabled={true}
          />
        </section>
      )}
    </div>
  );
};

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
  const [tree, setTree] = useState<KindrawTreeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const itemsById = Object.fromEntries(
    (tree?.items || []).map((item) => [item.id, item]),
  );

  const refreshTree = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const nextTree = await getTree();
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
        const nextTree = await getTree();
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

  const handleCreateFolder = useCallback(
    async (parentId: string | null) => {
      const name = promptForName("Nome da nova pasta");
      if (!name) {
        return;
      }

      await runMutation(async () => {
        await createFolder(name, parentId);
        await refreshTree();
      });
    },
    [refreshTree, runMutation],
  );

  const handleCreateItem = useCallback(
    async (kind: KindrawItemKind, folderId: string | null) => {
      const defaultTitle =
        kind === "drawing" ? "Novo drawing" : "Nova nota markdown";
      const title = promptForName("Titulo do item", defaultTitle);
      if (!title) {
        return;
      }

      await runMutation(async () => {
        const response = await createItem({
          kind,
          title,
          folderId,
          content: createInitialItemContent(kind, title),
        });
        await refreshTree();
        navigateKindraw(
          buildItemPath({
            id: response.itemId,
            kind,
          }),
        );
      });
    },
    [refreshTree, runMutation],
  );

  const handleRenameFolder = useCallback(
    async (folder: KindrawFolder) => {
      const nextName = promptForName("Novo nome da pasta", folder.name);
      if (!nextName || nextName === folder.name) {
        return;
      }

      await runMutation(async () => {
        await renameFolder(folder.id, nextName);
        await refreshTree();
      });
    },
    [refreshTree, runMutation],
  );

  const handleDeleteFolder = useCallback(
    async (folder: KindrawFolder) => {
      if (!window.confirm(`Excluir a pasta "${folder.name}"?`)) {
        return;
      }

      await runMutation(async () => {
        await deleteFolder(folder.id);
        await refreshTree();
        if (route.kind === "workspace" && route.folderId === folder.id) {
          navigateKindraw("/", { replace: true });
        }
      });
    },
    [refreshTree, route, runMutation],
  );

  const handleRenameItem = useCallback(
    async (item: KindrawItem) => {
      const nextTitle = promptForName("Novo titulo do item", item.title);
      if (!nextTitle || nextTitle === item.title) {
        return;
      }

      await runMutation(async () => {
        await updateItemMeta(item.id, { title: nextTitle });
        await refreshTree();
      });
    },
    [refreshTree, runMutation],
  );

  const handleDeleteItem = useCallback(
    async (item: KindrawItem) => {
      if (!window.confirm(`Excluir "${item.title}"?`)) {
        return;
      }

      await runMutation(async () => {
        await deleteItem(item.id);
        await refreshTree();
        if (
          (route.kind === "drawing" || route.kind === "doc") &&
          route.itemId === item.id
        ) {
          navigateKindraw(buildFolderPath(item.folderId), { replace: true });
        }
      });
    },
    [refreshTree, route, runMutation],
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
          <span className="kindraw-eyebrow">Kindraw v1</span>
          <h1>Seu Excalidraw com conta, pastas e docs</h1>
          <p>
            Entre com GitHub para organizar drawings e arquivos Markdown no seu
            workspace.
          </p>
          <div className="kindraw-toolbar">
            <button
              className="kindraw-button"
              onClick={openGithubLogin}
              type="button"
            >
              Entrar com GitHub
            </button>
            <a className="kindraw-link-button" href="/">
              Abrir Excalidraw publico
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
        <p>Carregando arvore do workspace...</p>
      </div>
    );
  }

  return (
    <div className="kindraw-shell">
      <header className="kindraw-topbar">
        <div className="kindraw-topbar__brand">
          <a href="/">Kindraw</a>
          <span>workspace autenticado</span>
        </div>
        <div className="kindraw-topbar__session">
          <div className="kindraw-topbar__user">
            {session.user.avatarUrl ? (
              <img alt={session.user.name} src={session.user.avatarUrl} />
            ) : (
              <span className="kindraw-avatar-fallback">
                {session.user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <strong>{session.user.name}</strong>
              <span>@{session.user.githubLogin}</span>
            </div>
          </div>
          <button
            className="kindraw-link-button"
            disabled={isMutating}
            onClick={() => void handleLogout()}
            type="button"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="kindraw-shell__body">
        <aside className="kindraw-sidebar">
          <div className="kindraw-sidebar__section">
            <div className="kindraw-sidebar__header">
              <h2>Pastas</h2>
              <button
                className="kindraw-link-button"
                onClick={() =>
                  void handleCreateFolder(
                    route.kind === "workspace" ? route.folderId : null,
                  )
                }
                type="button"
              >
                +
              </button>
            </div>
            <button
              className={`kindraw-tree__button${
                route.kind === "workspace" && route.folderId === null
                  ? " kindraw-tree__button--active"
                  : ""
              }`}
              onClick={() => navigateKindraw("/")}
              type="button"
            >
              Raiz
            </button>
            <FolderTree
              currentFolderId={
                route.kind === "workspace" ? route.folderId : null
              }
              folders={tree.folders}
              parentId={null}
            />
          </div>
          <div className="kindraw-sidebar__section">
            <div className="kindraw-sidebar__header">
              <h2>Criar</h2>
            </div>
            <div className="kindraw-action-grid">
              <button
                className="kindraw-button kindraw-button--secondary"
                onClick={() =>
                  void handleCreateItem(
                    "drawing",
                    route.kind === "workspace" ? route.folderId : null,
                  )
                }
                type="button"
              >
                Drawing
              </button>
              <button
                className="kindraw-button kindraw-button--secondary"
                onClick={() =>
                  void handleCreateItem(
                    "doc",
                    route.kind === "workspace" ? route.folderId : null,
                  )
                }
                type="button"
              >
                Markdown
              </button>
            </div>
          </div>
          {errorMessage ? (
            <p className="kindraw-error-copy">{errorMessage}</p>
          ) : null}
        </aside>

        <main className="kindraw-main">
          {route.kind === "workspace" ? (
            <WorkspacePage
              currentFolderId={route.folderId}
              onCreateFolder={handleCreateFolder}
              onCreateItem={handleCreateItem}
              onDeleteFolder={handleDeleteFolder}
              onDeleteItem={handleDeleteItem}
              onRenameFolder={handleRenameFolder}
              onRenameItem={handleRenameItem}
              tree={tree}
            />
          ) : route.kind === "drawing" ? (
            <DrawingEditorPage
              itemId={route.itemId}
              onTreeRefresh={refreshTree}
            />
          ) : route.kind === "doc" ? (
            <DocEditorPage
              itemId={route.itemId}
              itemsById={itemsById}
              onTreeRefresh={refreshTree}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
};
