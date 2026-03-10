import { useI18n } from "@excalidraw/excalidraw/i18n";

import { buildPublicShareUrl } from "./api";

import type { KindrawShareLink } from "./types";

type ShareLinksPanelProps = {
  shareLinks: KindrawShareLink[];
  onCreateShareLink: () => Promise<void> | void;
  onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  busy?: boolean;
};

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    console.warn("Failed to copy Kindraw share link:", error);
  }
};

export const ShareLinksPanel = ({
  shareLinks,
  onCreateShareLink,
  onRevokeShareLink,
  busy,
}: ShareLinksPanelProps) => {
  const { t } = useI18n();
  const activeShareLink = shareLinks[0] || null;

  return (
    <section className="kindraw-share-links">
      <div className="kindraw-share-links__header">
        <div>
          <h3>{t("kindraw.sharePanel.title")}</h3>
          <p>{t("kindraw.sharePanel.description")}</p>
        </div>
        {!activeShareLink ? (
          <button
            className="kindraw-button kindraw-button--secondary"
            disabled={busy}
            onClick={() => void onCreateShareLink()}
            type="button"
          >
            {t("kindraw.actions.generateLink")}
          </button>
        ) : null}
      </div>

      {activeShareLink ? (
        <ul className="kindraw-share-links__list">
          <li key={activeShareLink.id}>
            <a
              href={buildPublicShareUrl(activeShareLink.token)}
              rel="noreferrer"
              target="_blank"
            >
              {buildPublicShareUrl(activeShareLink.token)}
            </a>
            <div className="kindraw-share-links__actions">
              <button
                className="kindraw-link-button"
                onClick={() =>
                  void copyToClipboard(
                    buildPublicShareUrl(activeShareLink.token),
                  )
                }
                type="button"
              >
                {t("kindraw.actions.copy")}
              </button>
              <button
                className="kindraw-link-button kindraw-link-button--danger"
                disabled={busy}
                onClick={() => void onRevokeShareLink(activeShareLink.id)}
                type="button"
              >
                {t("kindraw.actions.revoke")}
              </button>
            </div>
          </li>
        </ul>
      ) : (
        <p className="kindraw-share-links__empty">
          {t("kindraw.sharePanel.empty")}
        </p>
      )}
    </section>
  );
};
