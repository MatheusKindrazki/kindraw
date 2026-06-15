import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useState } from "react";

import { createApiToken } from "../kindraw/api";

import type { TranslationKeys } from "@excalidraw/excalidraw/i18n";

import "./AgentsGuide.scss";

const TOKEN_PLACEHOLDER = "kdr_...";

const buildMcpConfig = (token: string) =>
  `{
  "mcpServers": {
    "kindraw": {
      "command": "npx",
      "args": ["-y", "@kindraw/mcp"],
      "env": { "KINDRAW_TOKEN": "${token}" }
    }
  }
}`;

const buildCliLogin = () => `npx @kindraw/cli login`;

const buildCliEnv = (token: string) =>
  `export KINDRAW_TOKEN="${token}"
npx @kindraw/cli items list`;

const buildCliGenerate = () =>
  `kindraw generate --mermaid flow.mmd --title "My flow"`;

const MCP_TOOLS: { name: string; descKey: TranslationKeys }[] = [
  { name: "kindraw_create_diagram", descKey: "kindraw.agents.tools.createDiagram" },
  { name: "kindraw_create_drawing", descKey: "kindraw.agents.tools.createDrawing" },
  { name: "kindraw_list_items", descKey: "kindraw.agents.tools.listItems" },
  { name: "kindraw_get_item", descKey: "kindraw.agents.tools.getItem" },
  { name: "kindraw_delete_item", descKey: "kindraw.agents.tools.deleteItem" },
];

/** Bloco de código com botão "Copiar" e feedback inline. */
const CodeBlock = ({ code, label }: { code: string; label?: string }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToSystemClipboard(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard pode falhar em contextos sem permissão; ignora silenciosamente
    }
  };

  return (
    <div className="kindraw-codeblock">
      {label && <span className="kindraw-codeblock__label">{label}</span>}
      <div className="kindraw-codeblock__body">
        <pre className="kindraw-codeblock__pre">
          <code>{code}</code>
        </pre>
        <button
          type="button"
          className="kindraw-codeblock__copy"
          onClick={() => void handleCopy()}
        >
          {copied
            ? t("kindraw.agents.copied")
            : t("kindraw.agents.copy")}
        </button>
      </div>
    </div>
  );
};

/**
 * Guideline de uso do Kindraw em agents/LLMs: setup do MCP (Claude/Cursor) e
 * uso via CLI. Permite gerar uma key inline que preenche os snippets uma vez.
 */
export const AgentsGuide = () => {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await createApiToken("Agent integration");
      setToken(result.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const tokenValue = token ?? TOKEN_PLACEHOLDER;

  return (
    <div className="kindraw-agents-guide">
      <p className="kindraw-agents-guide__intro">
        {t("kindraw.agents.intro")}
      </p>

      <div className="kindraw-agents-guide__keybar">
        <button
          type="button"
          className="kindraw-agents-guide__generate"
          onClick={() => void handleGenerate()}
          disabled={generating}
        >
          {generating
            ? t("kindraw.apiTokens.generating")
            : t("kindraw.agents.generateKey")}
        </button>
        {token ? (
          <span className="kindraw-agents-guide__warning">
            {t("kindraw.apiTokens.secretHelper")}
          </span>
        ) : (
          <span className="kindraw-agents-guide__hint">
            {t("kindraw.agents.keyHint")}
          </span>
        )}
      </div>

      {error && <p className="kindraw-agents-guide__error">{error}</p>}

      {/* Bloco A — MCP (Claude/Cursor) */}
      <section className="kindraw-agents-guide__section">
        <h4>{t("kindraw.agents.mcpTitle")}</h4>
        <p>{t("kindraw.agents.mcpDescription")}</p>
        <CodeBlock code={buildMcpConfig(tokenValue)} />
        <ul className="kindraw-agents-guide__tools">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name}>
              <code>{tool.name}</code>
              <span>{t(tool.descKey)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bloco B — CLI */}
      <section className="kindraw-agents-guide__section">
        <h4>{t("kindraw.agents.cliTitle")}</h4>
        <p>{t("kindraw.agents.cliDescription")}</p>
        <CodeBlock code={buildCliLogin()} label={t("kindraw.agents.cliLoginLabel")} />
        <CodeBlock code={buildCliEnv(tokenValue)} label={t("kindraw.agents.cliEnvLabel")} />
        <CodeBlock
          code={buildCliGenerate()}
          label={t("kindraw.agents.cliGenerateLabel")}
        />
      </section>
    </div>
  );
};
