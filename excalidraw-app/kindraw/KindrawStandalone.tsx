import { Excalidraw } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useState, startTransition } from "react";

import { getPublicItem, getSession, getTree, openGithubLogin } from "./api";
import { DocEditorPage } from "./DocEditorPage";
import { parseDrawingContent } from "./content";
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
        getErrorMessage(error, "Falha ao atualizar o workspace."),
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
        setErrorMessage(getErrorMessage(error, "Falha ao carregar o Kindraw."));
        setSession(null);
      }
    };

    void load();
  }, []);

  if (typeof session === "undefined") {
    return (
      <div className="kindraw-loading-shell">
        <p>Carregando documento...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-eyebrow">Kindraw</span>
          <h1>Entre com GitHub para editar este doc</h1>
          <div className="kindraw-toolbar">
            <button
              className="kindraw-button"
              onClick={openGithubLogin}
              type="button"
            >
              Entrar com GitHub
            </button>
            <a className="kindraw-link-button" href="/">
              Voltar ao canvas
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
        <p>Carregando workspace...</p>
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
          Abrir canvas
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
