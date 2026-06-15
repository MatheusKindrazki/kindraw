import { useEffect, useMemo, useRef, useState } from "react";

import { colorForUser } from "./identity";
import { PresenceFacepile } from "./PresenceFacepile";
import { RichTextEditor } from "./RichTextEditor";
import { usePresence } from "./usePresence";
import { KindrawYjsProvider } from "./yjsProvider";

import type { KindrawPublicItemResponse } from "./types";

// View de edição AO VIVO via link público "live-edit". Diferente do
// HybridPublicShareView (read-only), aqui o portador do link entra na sessão de
// colaboração Yjs do documento — autorizado pelo token na URL do WebSocket
// (?token=). O convidado escolhe um nome na entrada; a cor é estável por hash.

const GUEST_ID_KEY = "kindraw:guest-id";
const GUEST_NAME_KEY = "kindraw:guest-name";

// id estável por navegador (gera 1x) — base da cor de presença do convidado.
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

  // Tela de entrada: convidado confirma o nome antes de entrar na sessão.
  const [name, setName] = useState(getStoredName);
  const [entered, setEntered] = useState(() => getStoredName().length > 0);

  const [provider, setProvider] = useState<KindrawYjsProvider | null>(null);
  const providerRef = useRef<KindrawYjsProvider | null>(null);

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

    // idle/grace simples p/ o convidado
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
    <div className="kindraw-share-shell">
      <header className="kindraw-public-view__header kindraw-public-view__header--live">
        <div>
          <span className="kindraw-eyebrow">Edição ao vivo</span>
          <h1>{itemResponse.item.title}</h1>
        </div>
        <PresenceFacepile users={presence} />
      </header>

      <section className="kindraw-share-shell__content">
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
    </div>
  );
};
