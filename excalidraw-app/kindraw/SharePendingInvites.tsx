import { useCallback, useEffect, useRef, useState } from "react";

import { buildInviteUrl } from "./api";
import { useKindrawI18n } from "./i18n";
import { KindrawIcon } from "./icons";

import type { KindrawPendingInvite } from "./types";

// Botão "Copiar link" reutilizável com feedback "Copiado" temporário. Espera o
// link RELATIVO do convite (/invite/<token>) e monta a URL absoluta.
const CopyInviteLinkButton = ({
  link,
  label,
}: {
  link: string;
  label?: string;
}) => {
  const { t } = useKindrawI18n();
  const resolvedLabel = label ?? t("kindraw.actions.copyLink");
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const url = buildInviteUrl(link);
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Failed to copy Kindraw invite link:", error);
    }
  }, [link]);

  return (
    <button
      className="kindraw-btn kindraw-btn--soft kindraw-btn--sm"
      onClick={() => void handleCopy()}
      type="button"
    >
      {copied ? (
        <>
          {t("kindraw.actions.copied")} <KindrawIcon name="check" size={13} />
        </>
      ) : (
        <>
          <KindrawIcon name="copy" size={14} /> {resolvedLabel}
        </>
      )}
    </button>
  );
};

// Caixa de destaque com o link do convite RECÉM-CRIADO, pronta para copiar.
// Renderizada ACIMA da lista "Pessoas com acesso" (fora do <ul>).
export const CreatedInviteBox = ({
  invite,
}: {
  invite: KindrawPendingInvite;
}) => {
  const { t } = useKindrawI18n();
  return (
    <div className="kindraw-invite-created">
      <span className="kindraw-invite-created__label">
        {t("kindraw.invites.createdLabel")}
      </span>
      <div className="kindraw-linkbox">
        <a href={buildInviteUrl(invite.link)} rel="noreferrer" target="_blank">
          {buildInviteUrl(invite.link).replace(/^https?:\/\//, "")}
        </a>
        <CopyInviteLinkButton link={invite.link} label={t("kindraw.actions.copy")} />
      </div>
    </div>
  );
};

// Itens <li> de convites pendentes (selo "Pendente" + copiar-link + cancelar)
// renderizados dentro da lista "Pessoas com acesso", tanto em ShareFolderModal
// quanto em ShareHybridModal.
export const SharePendingInvites = ({
  invites,
  busyInviteId,
  onRevoke,
}: {
  invites: KindrawPendingInvite[];
  busyInviteId: string | null;
  onRevoke: (invite: KindrawPendingInvite) => void;
}) => {
  const { t } = useKindrawI18n();

  if (invites.length === 0) {
    return null;
  }

  return (
    <>
      {invites.map((invite) => {
        const busy = busyInviteId === invite.id;
        return (
          <li
            className="kindraw-sharemodal__person kindraw-sharemodal__person--invite"
            key={invite.id}
          >
            <span
              aria-hidden="true"
              className="kindraw-sharemodal__avatar kindraw-sharemodal__avatar--fallback"
            >
              <KindrawIcon name="link" size={15} />
            </span>
            <span className="kindraw-sharemodal__person-text">
              <strong>
                {invite.email || t("kindraw.invites.linkInviteFallback")}
              </strong>
              <span>
                {invite.role === "editor"
                  ? t("kindraw.roles.editor")
                  : t("kindraw.roles.viewer")}
              </span>
            </span>
            <span className="kindraw-sharemodal__pending-tag">
              {t("kindraw.invites.pendingTag")}
            </span>
            <CopyInviteLinkButton
              link={invite.link}
              label={t("kindraw.actions.copyLink")}
            />
            <button
              aria-label={t("kindraw.invites.cancelInviteAria")}
              className="kindraw-sharemodal__remove"
              disabled={busy}
              onClick={() => onRevoke(invite)}
              type="button"
            >
              <KindrawIcon name="close" size={15} />
            </button>
          </li>
        );
      })}
    </>
  );
};
