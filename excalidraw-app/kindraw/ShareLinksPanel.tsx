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
  const activeShareLink = shareLinks[0] || null;

  return (
    <section className="kindraw-share-links">
      <div className="kindraw-share-links__header">
        <div>
          <h3>Link publico</h3>
          <p>
            Somente leitura. Para colaboracao ao vivo, use o botao realtime.
          </p>
        </div>
        {!activeShareLink ? (
          <button
            className="kindraw-button kindraw-button--secondary"
            disabled={busy}
            onClick={() => void onCreateShareLink()}
            type="button"
          >
            Gerar link
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
                Copiar
              </button>
              <button
                className="kindraw-link-button kindraw-link-button--danger"
                disabled={busy}
                onClick={() => void onRevokeShareLink(activeShareLink.id)}
                type="button"
              >
                Revogar
              </button>
            </div>
          </li>
        </ul>
      ) : (
        <p className="kindraw-share-links__empty">
          Nenhum link publico ativo. Gere um link read-only para compartilhar.
        </p>
      )}
    </section>
  );
};
