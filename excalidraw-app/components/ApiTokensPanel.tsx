import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { copyIcon, TrashIcon } from "@excalidraw/excalidraw/components/icons";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useCallback, useEffect, useState } from "react";

import {
  listApiTokens,
  createApiToken,
  revokeApiToken,
} from "../kindraw/api";

import "./ApiTokensDialog.scss";

import type { KindrawApiToken } from "../kindraw/types";

const formatDate = (value: string | null) => {
  if (!value) {
    return null;
  }
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
};

/**
 * Conteúdo (sem chrome de modal) que lista, cria e revoga API keys do Kindraw.
 * Reutilizado pelo ApiTokensDialog e pela aba "API keys" do SettingsDialog.
 */
export const ApiTokensPanel = () => {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<KindrawApiToken[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { onCopy, copyStatus } = useCopyStatus();

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
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (prefix: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t("kindraw.apiTokens.revokeConfirm"))) {
      return;
    }
    setError(null);
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
          <code className="kindraw-api-tokens__secret-value">{newSecret}</code>
          <FilledButton
            size="large"
            status={copyStatus}
            icon={copyIcon}
            label={t("kindraw.apiTokens.copy")}
            onClick={() => {
              void copyTextToSystemClipboard(newSecret);
              onCopy();
            }}
          />
          <span className="kindraw-api-tokens__secret-helper">
            {t("kindraw.apiTokens.secretHelper")}
          </span>
        </div>
      )}

      <div className="kindraw-api-tokens__create">
        <TextField
          value={name}
          placeholder={t("kindraw.apiTokens.namePlaceholder")}
          onChange={setName}
          label={t("kindraw.apiTokens.title")}
        />
        <FilledButton
          size="large"
          label={
            generating
              ? t("kindraw.apiTokens.generating")
              : t("kindraw.apiTokens.generate")
          }
          onClick={() => void handleGenerate()}
        />
      </div>

      {error && <p className="kindraw-api-tokens__error">{error}</p>}

      <div className="kindraw-api-tokens__list">
        <h4>{t("kindraw.apiTokens.listTitle")}</h4>
        {loading ? (
          <p className="kindraw-api-tokens__muted">…</p>
        ) : tokens.length === 0 ? (
          <p className="kindraw-api-tokens__muted">
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
                        date: formatDate(token.lastSeenAt) || "",
                      })
                    : t("kindraw.apiTokens.neverUsed")}
                </div>
                <button
                  className="kindraw-api-tokens__revoke"
                  type="button"
                  aria-label={t("kindraw.apiTokens.revoke")}
                  title={t("kindraw.apiTokens.revoke")}
                  onClick={() => void handleRevoke(token.prefix)}
                >
                  {TrashIcon}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
