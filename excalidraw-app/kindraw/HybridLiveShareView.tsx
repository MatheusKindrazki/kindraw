import { useEffect, useMemo, useRef, useState } from "react";

import { Excalidraw } from "@excalidraw/excalidraw";

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";

import { createPublicDrawingInitialData } from "./content";
import { colorForUser } from "./identity";
import { PresenceFacepile } from "./PresenceFacepile";
import { RichTextEditor } from "./RichTextEditor";
import { useCanvasCollab } from "./useCanvasCollab";
import { usePresence } from "./usePresence";
import { KindrawYjsProvider } from "./yjsProvider";

import type { KindrawPublicItemResponse } from "./types";

// View de edição AO VIVO via link público "live-edit". Mostra o MESMO split
// doc+canvas do editor autenticado: documento Yjs (canal hdoc:) + canvas
// (canal hcanvas:), ambos autorizados pelo token na URL do WebSocket (?token=).
// O convidado escolhe um nome na entrada; a cor é estável por hash.

const GUEST_ID_KEY = "kindraw:guest-id";
const GUEST_NAME_KEY = "kindraw:guest-name";

const getGuestId = () => {
  try {
    const stored = window.localStorage.getItem(GUEST_ID_KEY);
    if (stored) {
      return stored;
    }
    const id = `guest-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return "guest-anon";
  }
};

const getStoredName = () => {
  try {
    return window.localStorage.getItem(GUEST_NAME_KEY) || "";
  } catch {
    return "";
  }
};

export const HybridLiveShareView = ({
  itemResponse,
  shareToken,
}: {
  itemResponse: KindrawPublicItemResponse;
  shareToken: string;
}) => {
  const hybrid = itemResponse.hybrid;
  const guestId = useMemo(getGuestId, []);
  const color = useMemo(() => colorForUser(guestId), [guestId]);

  const [name, setName] = useState(getStoredName);
  const [entered, setEntered] = useState(() => getStoredName().length > 0);

  const [provider, setProvider] = useState<KindrawYjsProvider | null>(null);
  const providerRef = useRef<KindrawYjsProvider | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // canvas ao vivo: o canal hcanvas usa a roomKey do drawing, entregue só em
  // link live-edit (ver getPublicItem). O token autoriza o WS.
  const canvasRoomKey = hybrid?.drawing.collaborationRoom?.roomKey ?? null;
  const canvasCollab = useCanvasCollab({
    enabled: entered && Boolean(hybrid) && Boolean(canvasRoomKey),
    roomId: hybrid ? `hcanvas:${hybrid.id}` : "",
    roomKey: canvasRoomKey,
    token: shareToken,
    profile: {
      name: getStoredName() || "Convidado",
      userId: guestId,
      avatarUrl: null,
      githubLogin: null,
    },
    excalidrawAPIRef,
  });

  useEffect(() => {
    if (!hybrid || !entered) {
      return undefined;
    }
    const displayName = (getStoredName() || "Convidado").trim();
    const p = new KindrawYjsProvider({
      roomId: `hdoc:${hybrid.id}`,
      token: shareToken,
      user: {
        name: displayName,
        color,
        avatarUrl: null,
        githubLogin: null,
        userId: guestId,
      },
    });
    providerRef.current = p;
    setProvider(p);

    let idleTimer: number | null = null;
    const goActive = () => {
      p.setIdle(false);
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
      idleTimer = window.setTimeout(() => p.setIdle(true), 60_000);
    };
    goActive();
    window.addEventListener("pointermove", goActive, { passive: true });
    window.addEventListener("keydown", goActive);

    return () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
      window.removeEventListener("pointermove", goActive);
      window.removeEventListener("keydown", goActive);
      p.destroy();
      providerRef.current = null;
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hybrid?.id, shareToken, entered, color, guestId]);

  const presence = usePresence(provider);

  // repassa os colaboradores do canvas p/ o Excalidraw renderizar cursores.
  useEffect(() => {
    excalidrawAPIRef.current?.updateScene({
      collaborators: canvasCollab.collaborators,
    });
  }, [canvasCollab.collaborators]);

  const onCanvasChange = useMemo<NonNullable<ExcalidrawProps["onChange"]>>(
    () => (elements) => {
      canvasCollab.broadcastScene(elements);
    },
    [canvasCollab],
  );

  if (!hybrid) {
    return (
      <div className="kindraw-share-shell">
        <div className="kindraw-loading-shell">
          <p>Este link não aponta para um documento híbrido editável.</p>
        </div>
      </div>
    );
  }

  // Tela de entrada (escolher nome) — só na primeira vez.
  if (!entered) {
    return (
      <div className="kindraw-share-shell">
        <div className="kindraw-login-shell">
          <div className="kindraw-login-card kindraw-guest-card">
            <span className="kindraw-eyebrow">Edição ao vivo</span>
            <h1>{itemResponse.item.title}</h1>
            <p>Como você quer aparecer para os outros nesta sessão?</p>
            <div className="kindraw-guest-entry">
              <span
                className="kindraw-guest-entry__swatch"
                style={{ background: color }}
              />
              <input
                aria-label="Seu nome nesta sessão"
                autoFocus
                className="kindraw-guest-entry__input"
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) {
                    window.localStorage.setItem(GUEST_NAME_KEY, name.trim());
                    setEntered(true);
                  }
                }}
                placeholder="Seu nome"
                value={name}
              />
            </div>
            <button
              className="kindraw-btn kindraw-btn--primary"
              disabled={!name.trim()}
              onClick={() => {
                window.localStorage.setItem(GUEST_NAME_KEY, name.trim());
                setEntered(true);
              }}
              type="button"
            >
              Entrar na sessão
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kindraw-editor-shell kindraw-hybrid-shell kindraw-live-share">
      <header className="kindraw-editor-header">
        <div className="kindraw-editor-header__leading">
          <span className="kindraw-eyebrow">Edição ao vivo</span>
          <span className="kindraw-editor-crumb">{itemResponse.item.title}</span>
        </div>
        <div className="kindraw-editor-header__trailing">
          <PresenceFacepile users={presence} />
        </div>
      </header>

      <div
        className="kindraw-hybrid-shell__body kindraw-hybrid-shell__body--both"
        style={{ gridTemplateColumns: "0.46fr 14px 0.54fr" }}
      >
        <section className="kindraw-hybrid-shell__document">
          <div className="kindraw-hybrid-doc kindraw-hybrid-doc--live">
            <div className="kindraw-hybrid-doc__editor kindraw-hybrid-doc__editor--live">
              {provider ? (
                <RichTextEditor
                  collab={{ provider, fieldName: "default" }}
                  onChange={() => undefined}
                  placeholder="Escreva em conjunto…"
                  seedMarkdown={itemResponse.content}
                  value={itemResponse.content}
                />
              ) : (
                <p className="kindraw-loading-shell">Conectando à sessão…</p>
              )}
            </div>
          </div>
        </section>
        <div className="kindraw-hybrid-shell__divider" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <section className="kindraw-hybrid-shell__canvas">
          <Excalidraw
            onExcalidrawAPI={(api: ExcalidrawImperativeAPI) => {
              excalidrawAPIRef.current = api;
            }}
            initialData={createPublicDrawingInitialData(
              hybrid.drawing.content,
            )}
            isCollaborating={canvasCollab.isConnected}
            onChange={onCanvasChange}
            onPointerUpdate={canvasCollab.onPointerUpdate}
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
          />
        </section>
      </div>
    </div>
  );
};
