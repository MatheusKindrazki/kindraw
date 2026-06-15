import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { copyIcon, TrashIcon } from "@excalidraw/excalidraw/components/icons";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
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
    if (
      !window.confirm(
        "Revogar este token? Apps que o usam vão parar de funcionar.",
      )
    ) {
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
        Crie um token para usar o Kindraw pela CLI (npx kindraw) ou pelo
        servidor MCP do Claude. Um token tem acesso total à sua conta.
      </p>

      {newSecret && (
        <div className="kindraw-api-tokens__secret">
          <strong>Copie seu token agora</strong>
          <code className="kindraw-api-tokens__secret-value">{newSecret}</code>
          <FilledButton
            size="large"
            status={copyStatus}
            icon={copyIcon}
            label="Copiar token"
            onClick={() => {
              void copyTextToSystemClipboard(newSecret);
              onCopy();
            }}
          />
          <span className="kindraw-api-tokens__secret-helper">
            Esta é a única vez que o token aparece. Guarde-o num lugar seguro.
          </span>
        </div>
      )}

      <div className="kindraw-api-tokens__create">
        <TextField
          value={name}
          placeholder="Nome do token (ex.: Meu notebook)"
          onChange={setName}
          label="API tokens"
        />
        <FilledButton
          size="large"
          label={generating ? "Gerando..." : "Gerar token"}
          onClick={() => void handleGenerate()}
        />
      </div>

      {error && <p className="kindraw-api-tokens__error">{error}</p>}

      <div className="kindraw-api-tokens__list">
        <h4>Tokens ativos</h4>
        {loading ? (
          <p className="kindraw-api-tokens__muted">…</p>
        ) : tokens.length === 0 ? (
          <p className="kindraw-api-tokens__muted">Nenhum token ainda.</p>
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
                    ? `Último uso ${formatDate(token.lastSeenAt) || ""}`
                    : "Nunca usado"}
                </div>
                <button
                  className="kindraw-api-tokens__revoke"
                  type="button"
                  aria-label="Revogar"
                  title="Revogar"
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
