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
        Conecte o Kindraw ao Claude, Cursor ou qualquer agente compatível com
        MCP, ou use pelo terminal com a CLI. Gere uma key abaixo para preencher
        os exemplos.
      </p>

      <div className="kindraw-agents-guide__keybar">
        <button
          type="button"
          className="kindraw-agents-guide__generate"
          onClick={() => void handleGenerate()}
          disabled={generating}
        >
          {generating ? "Gerando..." : "Gerar key para esta integração"}
        </button>
        {token ? (
          <span className="kindraw-agents-guide__warning">
            Esta é a única vez que a key aparece. Guarde-a num lugar seguro.
          </span>
        ) : (
          <span className="kindraw-agents-guide__hint">
            Gere uma key para preencher os exemplos abaixo, ou cole a sua.
          </span>
        )}
      </div>

      {error && <p className="kindraw-agents-guide__error">{error}</p>}

      {/* Bloco A — MCP (Claude/Cursor) */}
      <section className="kindraw-agents-guide__section">
        <h4>Configurar MCP (Claude / Cursor)</h4>
        <p>
          Adicione este servidor à config do seu cliente MCP (~/.claude.json ou
          .mcp.json do projeto). Reinicie o cliente depois.
        </p>
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

      {/* Bloco B — CLI */}
      <section className="kindraw-agents-guide__section">
        <h4>CLI</h4>
        <p>
          Use a CLI de qualquer terminal — entre uma vez, ou passe uma key via
          variável de ambiente KINDRAW_TOKEN.
        </p>
        <CodeBlock code={buildCliLogin()} label="Entrar (abre o navegador)" />
        <CodeBlock code={buildCliEnv(tokenValue)} label="Ou usar uma key direto" />
        <CodeBlock
          code={buildCliGenerate()}
          label="Gerar um desenho a partir de um arquivo Mermaid"
        />
      </section>
    </div>
  );
};
