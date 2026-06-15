import { useEffect, useRef, useState } from "react";

import { buildPublicShareUrl } from "./api";
import { useKindrawI18n } from "./i18n";
import { KindrawIcon } from "./icons";
import { PublicShareLinkSection } from "./PublicShareLinkSection";

import type { KindrawShareLink, KindrawShareLinkAccess } from "./types";

type ShareLinksPanelProps = {
  shareLinks: KindrawShareLink[];
  onCreateShareLink: (access?: KindrawShareLinkAccess) => Promise<void> | void;
  onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  busy?: boolean;
  buildShareUrl?: (token: string) => string;
  /** Quando true, exibe o seletor de modo do link (leitura / edição ao vivo). */
  supportsLiveEdit?: boolean;
};

/**
 * Popover de compartilhamento ancorado no botão primário "Compartilhar".
 * Usado pelos editores de canvas/doc avulsos (Drawing/Doc). O editor híbrido usa
 * o dialog unificado (ShareHybridModal), que embute a mesma PublicShareLinkSection.
 */
export const ShareLinksPanel = ({
  shareLinks,
  onCreateShareLink,
  onRevokeShareLink,
  busy,
  buildShareUrl = buildPublicShareUrl,
  supportsLiveEdit,
}: ShareLinksPanelProps) => {
  const { t } = useKindrawI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="kindraw-menuwrap" ref={wrapRef}>
      <button
        aria-expanded={shareOpen}
        aria-haspopup="dialog"
        className="kindraw-btn kindraw-btn--primary"
        onClick={() => setShareOpen(!shareOpen)}
        type="button"
      >
        <KindrawIcon name="share" size={16} /> {t("kindraw.actions.share")}
      </button>

      {shareOpen ? (
        <div
          aria-label={t("kindraw.actions.share")}
          className="kindraw-popover kindraw-popover--share"
          role="dialog"
        >
          <h3 className="kindraw-share__title">{t("kindraw.actions.share")}</h3>
          <PublicShareLinkSection
            buildShareUrl={buildShareUrl}
            busy={busy}
            onCreateShareLink={onCreateShareLink}
            onRevokeShareLink={onRevokeShareLink}
            shareLinks={shareLinks}
            supportsLiveEdit={supportsLiveEdit}
          />
        </div>
      ) : null}
    </div>
  );
};
