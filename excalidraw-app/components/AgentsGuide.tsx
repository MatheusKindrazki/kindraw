import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useState } from "react";

import { createApiToken } from "../kindraw/api";

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

const MCP_TOOLS: { name: string; desc: string }[] = [
  {
    name: "kindraw_create_diagram",
    desc: "Cria um desenho a partir de uma definição Mermaid (fluxograma, sequência, classe, ER…).",
  },
  {
    name: "kindraw_create_drawing",
    desc: "Cria um desenho a partir de JSON do Excalidraw já serializado.",
  },
  { name: "kindraw_list_items", desc: "Lista seus desenhos e docs." },
  { name: "kindraw_get_item", desc: "Busca um item com o conteúdo." },
  { name: "kindraw_delete_item", desc: "Exclui um item." },
];

/** Bloco de código com botão "Copiar" e feedback inline. */
const CodeBlock = ({ code, label }: { code: string; label?: string }) => {
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
          {copied ? "Copiado!" : "Copiar"}
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
        Deixe um agente desenhar por você: gere diagramas a partir de Mermaid,
        liste e edite seus drawings direto do Claude, Cursor ou do terminal.
      </p>

      {/* Passo 1 — a key é a protagonista */}
      <div
        className={`kindraw-agents-guide__keybar${
          token ? " kindraw-agents-guide__keybar--issued" : ""
        }`}
      >
        <div className="kindraw-agents-guide__keybar-text">
          <strong>
            {token ? "Pronto — key gerada" : "Comece gerando uma key"}
          </strong>
          <span>
            {token
              ? "Já preenchemos os exemplos abaixo. Copie a key agora: ela não aparece de novo."
              : "Ela autentica o agente na sua conta. Preenche os exemplos automaticamente."}
          </span>
        </div>
        <button
          type="button"
          className="kindraw-agents-guide__generate"
          onClick={() => void handleGenerate()}
          disabled={generating}
        >
          {generating ? "Gerando…" : token ? "Gerar outra" : "Gerar key"}
        </button>
      </div>

      {error && <p className="kindraw-agents-guide__error">{error}</p>}

      {/* Passo 2 — MCP (Claude/Cursor) */}
      <section className="kindraw-agents-guide__section">
        <div className="kindraw-agents-guide__section-head">
          <span className="kindraw-agents-guide__step">1</span>
          <div>
            <h4>Plugue no Claude ou Cursor</h4>
            <p>
              Cole em <code>~/.claude.json</code> ou no{" "}
              <code>.mcp.json</code> do projeto e reinicie o cliente.
            </p>
          </div>
        </div>
        <CodeBlock code={buildMcpConfig(tokenValue)} />
        <ul className="kindraw-agents-guide__tools">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name}>
              <code>{tool.name}</code>
              <span>{tool.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Passo 3 — CLI */}
      <section className="kindraw-agents-guide__section">
        <div className="kindraw-agents-guide__section-head">
          <span className="kindraw-agents-guide__step">2</span>
          <div>
            <h4>Ou use pelo terminal</h4>
            <p>
              Entre uma vez, ou passe a key em <code>KINDRAW_TOKEN</code> para
              scripts e CI.
            </p>
          </div>
        </div>
        <CodeBlock code={buildCliLogin()} label="Entrar (abre o navegador)" />
        <CodeBlock code={buildCliEnv(tokenValue)} label="Ou usar a key direto" />
        <CodeBlock
          code={buildCliGenerate()}
          label="Gerar um desenho de um arquivo Mermaid"
        />
      </section>
    </div>
  );
};
