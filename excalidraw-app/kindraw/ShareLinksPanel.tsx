import { useCallback, useEffect, useRef, useState } from "react";

import { buildPublicShareUrl } from "./api";
import { KindrawIcon } from "./icons";

import type { KindrawShareLink, KindrawShareLinkAccess } from "./types";

type ShareLinksPanelProps = {
  shareLinks: KindrawShareLink[];
  onCreateShareLink: (access?: KindrawShareLinkAccess) => Promise<void> | void;
  onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  busy?: boolean;
  buildShareUrl?: (token: string) => string;
  /** Quando true, exibe o seletor de modo do link (leitura / edição ao vivo). */
  supportsLiveEdit?: boolean;
  /** Quando definido, exibe a linha "Sessão ao vivo" no popover. */
  liveSessionActive?: boolean;
  onToggleLiveSession?: () => Promise<void> | void;
};

/**
 * Popover de compartilhamento ancorado no botão primário "Compartilhar".
 * Fecha com clique fora ou Esc; o feedback de cópia acontece no próprio
 * botão ("Copiado ✓" por 2s), sem tocar no status pill global.
 */
export const ShareLinksPanel = ({
  shareLinks,
  onCreateShareLink,
  onRevokeShareLink,
  busy,
  buildShareUrl = buildPublicShareUrl,
  supportsLiveEdit,
  liveSessionActive,
  onToggleLiveSession,
}: ShareLinksPanelProps) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shareOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setShareOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shareOpen]);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    },
    [],
  );

  const activeShareLink = shareLinks[0] || null;
  const publicUrl = activeShareLink
    ? buildShareUrl(activeShareLink.token)
    : null;

  const handleCopy = useCallback(async () => {
    if (!publicUrl || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.warn("Failed to copy Kindraw share link:", error);
    }
  }, [publicUrl]);

  return (
    <div className="kindraw-menuwrap" ref={wrapRef}>
      <button
        aria-expanded={shareOpen}
        aria-haspopup="dialog"
        className="kindraw-btn kindraw-btn--primary"
        onClick={() => setShareOpen(!shareOpen)}
        type="button"
      >
        <KindrawIcon name="share" size={16} /> Compartilhar
      </button>

      {shareOpen ? (
        <div
          aria-label="Compartilhar"
          className="kindraw-popover kindraw-popover--share"
          role="dialog"
        >
          <h3 className="kindraw-share__title">Compartilhar</h3>

          <div className="kindraw-share__row">
            <div className="kindraw-share__rowtext">
              <strong>Link público</strong>
              <span>Qualquer pessoa com o link pode ver</span>
            </div>
            <button
              aria-checked={Boolean(activeShareLink)}
              aria-label="Link público"
              className={`kindraw-toggle${
                activeShareLink ? " kindraw-toggle--on" : ""
              }`}
              disabled={busy}
              onClick={() =>
                activeShareLink
                  ? void onRevokeShareLink(activeShareLink.id)
                  : void onCreateShareLink()
              }
              role="switch"
              type="button"
            >
              <i />
            </button>
          </div>

          {activeShareLink && publicUrl ? (
            <>
              {supportsLiveEdit ? (
                <div className="kindraw-share__access">
                  <label className="kindraw-share__access-label">
                    Permissão do link
                  </label>
                  <select
                    aria-label="Permissão do link"
                    className="kindraw-sharemodal__roleselect"
                    disabled={busy}
                    onChange={(event) =>
                      void onCreateShareLink(
                        event.target.value as KindrawShareLinkAccess,
                      )
                    }
                    value={activeShareLink.access || "read"}
                  >
                    <option value="read">Somente leitura</option>
                    <option value="live-edit">Pode editar ao vivo</option>
                  </select>
                </div>
              ) : null}
              <div className="kindraw-linkbox">
                <a href={publicUrl} rel="noreferrer" target="_blank">
                  {publicUrl.replace(/^https?:\/\//, "")}
                </a>
                <button
                  className="kindraw-btn kindraw-btn--soft kindraw-btn--sm"
                  onClick={() => void handleCopy()}
                  type="button"
                >
                  {copied ? (
                    <>
                      Copiado <KindrawIcon name="check" size={13} />
                    </>
                  ) : (
                    <>
                      <KindrawIcon name="copy" size={14} /> Copiar
                    </>
                  )}
                </button>
              </div>
            </>
          ) : null}

          {onToggleLiveSession ? (
            <div className="kindraw-share__row">
              <div className="kindraw-share__rowtext">
                <strong>Sessão ao vivo</strong>
                <span>Colabore em tempo real com identidade GitHub</span>
              </div>
              <button
                className={`kindraw-btn kindraw-btn--sm ${
                  liveSessionActive
                    ? "kindraw-btn--soft"
                    : "kindraw-btn--primary"
                }`}
                disabled={busy}
                onClick={() => void onToggleLiveSession()}
                type="button"
              >
                {liveSessionActive ? "Encerrar" : "Iniciar"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
