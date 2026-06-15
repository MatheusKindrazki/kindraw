import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useCallback, useEffect, useState } from "react";

import { KindrawIcon } from "../kindraw/icons";

import { listApiTokens, createApiToken, revokeApiToken } from "../kindraw/api";

import { useKindrawI18n } from "../kindraw/i18n";

import "./ApiTokensDialog.scss";

import type { KindrawApiToken } from "../kindraw/types";

const formatDate = (value: string | null, langCode: string) => {
  if (!value) {
    return null;
  }
  try {
    return new Date(value).toLocaleDateString(langCode);
  } catch {
    return value;
  }
};

/**
 * Conteúdo (sem chrome de modal) que lista, cria e revoga API keys do Kindraw.
 * Reutilizado pelo ApiTokensDialog e pela aba "API keys" do SettingsDialog.
 * Usa a linguagem visual Ateliê (kd-*), não os componentes do editor Excalidraw.
 */
export const ApiTokensPanel = () => {
  const { t, langCode } = useKindrawI18n();
  const [tokens, setTokens] = useState<KindrawApiToken[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tokens: list } = await listApiTokens();
      setTokens(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await createApiToken(name.trim() || "API token");
      setNewSecret(result.secret);
      setCopied(false);
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (prefix: string) => {
    setError(null);
    setConfirmRevoke(null);
    try {
      await revokeApiToken(prefix);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="kindraw-api-tokens">
      <p className="kindraw-api-tokens__description">
        {t("kindraw.apiTokens.description")}
      </p>

      {newSecret && (
        <div className="kindraw-api-tokens__secret">
          <strong>{t("kindraw.apiTokens.secretTitle")}</strong>
          <div className="kindraw-api-tokens__secret-row">
            <code className="kindraw-api-tokens__secret-value">{newSecret}</code>
            <button
              type="button"
              className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
              onClick={() => {
                void copyTextToSystemClipboard(newSecret);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? t("kindraw.agents.copied") : t("kindraw.agents.copy")}
            </button>
          </div>
          <span className="kindraw-api-tokens__secret-helper">
            {t("kindraw.apiTokens.secretHelper")}
          </span>
        </div>
      )}

      <div className="kindraw-api-tokens__create">
        <span className="kindraw-api-tokens__create-icon" aria-hidden="true">
          <KindrawIcon name="link" size={16} />
        </span>
        <input
          className="kindraw-api-tokens__input"
          value={name}
          placeholder={t("kindraw.apiTokens.namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !generating) {
              void handleGenerate();
            }
          }}
          aria-label={t("kindraw.apiTokens.nameAria")}
        />
        <button
          type="button"
          className="kindraw-api-tokens__create-btn"
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {generating
            ? t("kindraw.apiTokens.generating")
            : t("kindraw.apiTokens.generate")}
        </button>
      </div>

      {error && <p className="kindraw-api-tokens__error">{error}</p>}

      <div className="kindraw-api-tokens__list">
        <h4>{t("kindraw.apiTokens.listTitle")}</h4>
        {loading ? (
          <ul aria-hidden="true" className="kindraw-api-tokens__skeleton">
            <li />
            <li />
          </ul>
        ) : tokens.length === 0 ? (
          <p className="kindraw-api-tokens__empty">
            {t("kindraw.apiTokens.empty")}
          </p>
        ) : (
          <ul>
            {tokens.map((token) => (
              <li key={token.prefix} className="kindraw-api-tokens__item">
                <div className="kindraw-api-tokens__item-main">
                  <span className="kindraw-api-tokens__item-name">
                    {token.name}
                  </span>
                  <code className="kindraw-api-tokens__item-prefix">
                    {token.prefix}…
                  </code>
                </div>
                <div className="kindraw-api-tokens__item-meta">
                  {token.lastSeenAt
                    ? t("kindraw.apiTokens.lastUsed", {
                        date: formatDate(token.lastSeenAt, langCode) || "",
                      })
                    : t("kindraw.apiTokens.neverUsed")}
                </div>
                {confirmRevoke === token.prefix ? (
                  <div className="kindraw-api-tokens__confirm">
                    <span>{t("kindraw.apiTokens.revokeConfirmShort")}</span>
                    <button
                      type="button"
                      className="kindraw-api-tokens__confirm-yes"
                      onClick={() => void handleRevoke(token.prefix)}
                    >
                      {t("kindraw.apiTokens.confirmYes")}
                    </button>
                    <button
                      type="button"
                      className="kindraw-api-tokens__confirm-no"
                      onClick={() => setConfirmRevoke(null)}
                    >
                      {t("kindraw.apiTokens.confirmNo")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="kindraw-api-tokens__revoke"
                    type="button"
                    aria-label={t("kindraw.apiTokens.revokeAria", {
                      name: token.name,
                    })}
                    title={t("kindraw.apiTokens.revoke")}
                    onClick={() => setConfirmRevoke(token.prefix)}
                  >
                    <KindrawIcon name="trash" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
