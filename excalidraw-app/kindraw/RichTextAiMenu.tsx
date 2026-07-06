import { useState } from "react";

import { streamDocAssist } from "./docAssist";
import { useKindrawI18n } from "./i18n";

import type { DocAssistAction } from "./docAssist";
import type { Editor } from "@tiptap/react";

// Ações de reescrita sobre a seleção. `prompt` pede um parâmetro extra ao
// usuário (tom desejado / idioma alvo) antes de chamar a I.A.
const ACTIONS: ReadonlyArray<{
  action: DocAssistAction;
  labelKey:
    | "kindraw.docAI.improve"
    | "kindraw.docAI.expand"
    | "kindraw.docAI.shorten"
    | "kindraw.docAI.fix"
    | "kindraw.docAI.tone"
    | "kindraw.docAI.translate";
  prompt?: "kindraw.docAI.tonePrompt" | "kindraw.docAI.translatePrompt";
}> = [
  { action: "improve", labelKey: "kindraw.docAI.improve" },
  { action: "expand", labelKey: "kindraw.docAI.expand" },
  { action: "shorten", labelKey: "kindraw.docAI.shorten" },
  { action: "fix", labelKey: "kindraw.docAI.fix" },
  { action: "tone", labelKey: "kindraw.docAI.tone", prompt: "kindraw.docAI.tonePrompt" },
  {
    action: "translate",
    labelKey: "kindraw.docAI.translate",
    prompt: "kindraw.docAI.translatePrompt",
  },
];

// Botão "✨ AI" do BubbleMenu: reescreve o trecho selecionado no lugar,
// via o endpoint de writing-assistant (GLM-4.7). Captura a seleção ANTES de
// qualquer prompt/await, então a substituição usa posições estáveis mesmo que
// o editor perca o foco durante o window.prompt.
export const RichTextAiMenu = ({ editor }: { editor: Editor }) => {
  const { t } = useKindrawI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    action: DocAssistAction,
    promptKey?: "kindraw.docAI.tonePrompt" | "kindraw.docAI.translatePrompt",
  ) => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) {
      setOpen(false);
      return;
    }

    let instruction: string | undefined;
    if (promptKey) {
      const value = window.prompt(t(promptKey));
      if (!value || !value.trim()) {
        setOpen(false);
        return;
      }
      instruction = value.trim();
    }

    setError(null);
    setLoading(true);
    try {
      const result = await streamDocAssist({ action, text, instruction });
      if (result) {
        editor.chain().focus().insertContentAt({ from, to }, result).run();
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("kindraw.docAI.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kindraw-rte__ai">
      <button
        type="button"
        className="kindraw-rte__menu-btn kindraw-rte__ai-trigger"
        aria-label={t("kindraw.docAI.menu")}
        aria-expanded={open}
        disabled={loading}
        // Evita que o mousedown colapse a seleção do editor.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">
          {loading ? <span className="kindraw-rte__ai-spinner" /> : "✨"}
        </span>
        <span className="kindraw-rte__ai-label">
          {loading ? t("kindraw.docAI.generating") : t("kindraw.docAI.menu")}
        </span>
      </button>
      {open && !loading ? (
        <div className="kindraw-rte__ai-menu" role="menu">
          {ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              className="kindraw-rte__ai-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void run(item.action, item.prompt)}
            >
              {t(item.labelKey)}
            </button>
          ))}
          {error ? (
            <div className="kindraw-rte__ai-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
