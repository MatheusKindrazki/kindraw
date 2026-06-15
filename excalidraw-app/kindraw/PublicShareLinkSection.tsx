import { useCallback, useEffect, useRef, useState } from "react";

import { buildPublicShareUrl } from "./api";
import { KindrawIcon } from "./icons";

import type { KindrawShareLink, KindrawShareLinkAccess } from "./types";

// Seção de LINK PÚBLICO reutilizável: toggle do link, seletor de permissão
// (read / live-edit) quando suportado, caixa do link + copiar, e a nota "ao
// vivo". Compartilhada entre o popover de share (ShareLinksPanel — Drawing/Doc)
// e o dialog unificado de share do híbrido (ShareHybridModal).

type PublicShareLinkSectionProps = {
  shareLinks: KindrawShareLink[];
  onCreateShareLink: (access?: KindrawShareLinkAccess) => Promise<void> | void;
  onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  busy?: boolean;
  buildShareUrl?: (token: string) => string;
  /** Quando true, exibe o seletor de modo do link (leitura / edição ao vivo). */
  supportsLiveEdit?: boolean;
};

export const PublicShareLinkSection = ({
  shareLinks,
  onCreateShareLink,
  onRevokeShareLink,
  busy,
  buildShareUrl = buildPublicShareUrl,
  supportsLiveEdit,
}: PublicShareLinkSectionProps) => {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

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
    <>
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

      {supportsLiveEdit ? (
        <p className="kindraw-share__live-note">
          <span className="kindraw-share__live-dot" />
          A edição é colaborativa em tempo real — todos com acesso de edição
          veem as mudanças ao vivo.
        </p>
      ) : null}
    </>
  );
};
