import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useCallback, useEffect, useState } from "react";

import { KindrawIcon } from "../kindraw/icons";

import { listApiTokens, createApiToken, revokeApiToken } from "../kindraw/api";

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
 * Usa a linguagem visual Ateliê (kd-*), não os componentes do editor Excalidraw.
 */
export const ApiTokensPanel = () => {
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
        Uma key dá a um agente, CLI ou script acesso total à sua conta. Gere uma
        por integração — assim você revoga uma sem derrubar as outras.
      </p>

      {newSecret && (
        <div className="kindraw-api-tokens__secret">
          <strong>Copie sua key agora</strong>
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
              {copied ? "Copiada!" : "Copiar"}
            </button>
          </div>
          <span className="kindraw-api-tokens__secret-helper">
            É a única vez que ela aparece. Não fica guardada em lugar nenhum.
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
          placeholder="Para onde é? (ex.: Claude do trabalho)"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !generating) {
              void handleGenerate();
            }
          }}
          aria-label="Nome da key"
        />
        <button
          type="button"
          className="kindraw-api-tokens__create-btn"
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {generating ? "Gerando…" : "Gerar key"}
        </button>
      </div>

      {error && <p className="kindraw-api-tokens__error">{error}</p>}

      <div className="kindraw-api-tokens__list">
        <h4>Keys ativas</h4>
        {loading ? (
          <ul aria-hidden="true" className="kindraw-api-tokens__skeleton">
            <li />
            <li />
          </ul>
        ) : tokens.length === 0 ? (
          <p className="kindraw-api-tokens__empty">
            Nenhuma key ainda. Gere a primeira acima para conectar um agente.
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
                    ? `Usada em ${formatDate(token.lastSeenAt) || ""}`
                    : "Nunca usada"}
                </div>
                {confirmRevoke === token.prefix ? (
                  <div className="kindraw-api-tokens__confirm">
                    <span>Revogar?</span>
                    <button
                      type="button"
                      className="kindraw-api-tokens__confirm-yes"
                      onClick={() => void handleRevoke(token.prefix)}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      className="kindraw-api-tokens__confirm-no"
                      onClick={() => setConfirmRevoke(null)}
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    className="kindraw-api-tokens__revoke"
                    type="button"
                    aria-label={`Revogar a key ${token.name}`}
                    title="Revogar"
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
