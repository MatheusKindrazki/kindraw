import { useEffect, useMemo, useRef, useState } from "react";

import { RichTextEditor } from "./RichTextEditor";
import { KindrawYjsProvider } from "./yjsProvider";

import type { KindrawPublicItemResponse } from "./types";

// View de edição AO VIVO via link público "live-edit". Diferente do
// HybridPublicShareView (read-only), aqui o portador do link entra na sessão de
// colaboração Yjs do documento — autorizado pelo token na URL do WebSocket
// (?token=). O canvas segue read-only nesta view (canvas ao vivo é só p/ quem
// abre o /draw autenticado).

const GUEST_COLORS = [
  "#c0392b",
  "#2980b9",
  "#27ae60",
  "#8e44ad",
  "#d35400",
  "#16a085",
  "#2c3e50",
];

// nome/cor de convidado estáveis por aba (persistem no sessionStorage).
const getGuestIdentity = () => {
  const KEY = "kindraw:guest-identity";
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored) {
      return JSON.parse(stored) as { name: string; color: string };
    }
  } catch {
    // ignore
  }
  const n = Math.floor(Math.random() * 9000) + 1000;
  const identity = {
    name: `Convidado ${n}`,
    color: GUEST_COLORS[n % GUEST_COLORS.length],
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
  return identity;
};

export const HybridLiveShareView = ({
  itemResponse,
  shareToken,
}: {
  itemResponse: KindrawPublicItemResponse;
  shareToken: string;
}) => {
  const hybrid = itemResponse.hybrid;
  const [provider, setProvider] = useState<KindrawYjsProvider | null>(null);
  const providerRef = useRef<KindrawYjsProvider | null>(null);
  const guest = useMemo(getGuestIdentity, []);

  useEffect(() => {
    if (!hybrid) {
      return undefined;
    }
    const p = new KindrawYjsProvider({
      roomId: `hdoc:${hybrid.id}`,
      token: shareToken,
      user: {
        name: guest.name,
        color: guest.color,
        avatarUrl: null,
        githubLogin: null,
        userId: null,
      },
    });
    providerRef.current = p;
    setProvider(p);
    return () => {
      p.destroy();
      providerRef.current = null;
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hybrid?.id, shareToken]);

  if (!hybrid) {
    // link live-edit num item não-híbrido: cai num editor colaborativo simples
    // não faz sentido; mostra um aviso curto.
    return (
      <div className="kindraw-share-shell">
        <div className="kindraw-loading-shell">
          <p>Este link não aponta para um documento híbrido editável.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kindraw-share-shell">
      <header className="kindraw-public-view__header">
        <div>
          <span className="kindraw-eyebrow">Edição ao vivo</span>
          <h1>{itemResponse.item.title}</h1>
          <p>
            Você entrou numa sessão de colaboração em tempo real como{" "}
            <strong>{guest.name}</strong>.
          </p>
        </div>
      </header>

      <section className="kindraw-share-shell__content">
        <div className="kindraw-hybrid-doc kindraw-hybrid-doc--live">
          <div className="kindraw-live-banner" role="status">
            <span className="kindraw-live-banner__dot" />
            Sessão ao vivo — edição colaborativa em tempo real
          </div>
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
