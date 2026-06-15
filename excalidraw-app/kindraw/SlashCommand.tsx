import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

import { t } from "@excalidraw/excalidraw/i18n";

import { SlashCommandMenu } from "./SlashCommandMenu";

import type { Editor, Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { ReactNode } from "react";
import type { SlashCommandMenuRef } from "./SlashCommandMenu";

// Slash "/" command rico (estilo Notion/Outline). Substitui o FloatingMenu cru:
// digitar "/" numa linha abre uma lista vertical de blocos, navegável por
// teclado e filtrável pelo texto após "/". Implementado com @tiptap/suggestion
// + ReactRenderer; o popup é posicionado manualmente pelo clientRect (sem
// tippy/popper externos) e ancorado ao cursor, flipando se não couber embaixo.

export type SlashCommandItem = {
  id: string;
  title: string;
  description: string;
  // Termos extras para o filtro (além do título).
  keywords: string[];
  icon: ReactNode;
  command: (props: { editor: Editor; range: Range }) => void;
};

// Ícones SVG inline (stroke 1.7, round) no padrão do KindrawIcon, para os
// blocos que não existem em icons.tsx.
const svg = (body: ReactNode) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={18}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.7}
    style={{ display: "block" }}
    viewBox="0 0 24 24"
    width={18}
  >
    {body}
  </svg>
);

const ICONS = {
  h1: svg(
    <g>
      <path d="M4 6v12M11 6v12M4 12h7" />
      <path d="M15.5 9.5l2-1.5v10" />
    </g>,
  ),
  h2: svg(
    <g>
      <path d="M4 6v12M11 6v12M4 12h7" />
      <path d="M15 9.2a2.2 2.2 0 1 1 3.6 1.7L15 18h4" />
    </g>,
  ),
  h3: svg(
    <g>
      <path d="M4 6v12M11 6v12M4 12h7" />
      <path d="M15 8.5a2 2 0 1 1 2.9 1.8 2 2 0 1 1-2.9 2" />
    </g>,
  ),
  bullet: svg(
    <g>
      <circle cx="5" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9.5 7h10M9.5 12h10M9.5 17h10" />
    </g>,
  ),
  ordered: svg(
    <g>
      <path d="M9.5 7h10M9.5 12h10M9.5 17h10" />
      <path d="M4 6l1.3-.6V9M3.6 15.4c0-.7.6-1.2 1.3-1.2s1.3.5 1.3 1.2c0 1.1-2.6 1.6-2.6 3h2.7" />
    </g>,
  ),
  task: svg(
    <g>
      <rect x="3.5" y="4.5" width="7" height="7" rx="1.6" />
      <path d="M5.2 8l1.3 1.3L9 6.5" />
      <path d="M14 8h6M14 16h6" />
      <rect x="3.5" y="12.5" width="7" height="7" rx="1.6" />
    </g>,
  ),
  quote: svg(
    <g>
      <path d="M9.5 6.5C7 7.5 5.5 9.5 5.5 12v5.5h5V12H7.2c0-1.7.9-3 2.8-3.7zM18.5 6.5c-2.5 1-4 3-4 5.5v5.5h5V12h-3.3c0-1.7.9-3 2.8-3.7z" />
    </g>,
  ),
  code: svg(
    <g>
      <path d="M9 8.5L5 12l4 3.5M15 8.5l4 3.5-4 3.5" />
    </g>,
  ),
  divider: svg(
    <g>
      <path d="M4 12h16" />
      <path d="M6.5 7.5h11M6.5 16.5h11" opacity="0.4" />
    </g>,
  ),
};

// Constrói a lista de comandos resolvendo as strings via t() no momento da
// chamada (a cada abertura do menu, em filterCommands), refletindo o idioma
// corrente sem precisar de hook reativo — o popup é recriado a cada "/".
export const getSlashCommands = (): SlashCommandItem[] => [
  {
    id: "heading1",
    title: t("kindraw.slashCommand.heading1.title"),
    description: t("kindraw.slashCommand.heading1.description"),
    keywords: ["titulo", "heading", "h1", "header"],
    icon: ICONS.h1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    id: "heading2",
    title: t("kindraw.slashCommand.heading2.title"),
    description: t("kindraw.slashCommand.heading2.description"),
    keywords: ["titulo", "heading", "h2", "header"],
    icon: ICONS.h2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    title: t("kindraw.slashCommand.heading3.title"),
    description: t("kindraw.slashCommand.heading3.description"),
    keywords: ["titulo", "heading", "h3", "header"],
    icon: ICONS.h3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bulletList",
    title: t("kindraw.slashCommand.bulletList.title"),
    description: t("kindraw.slashCommand.bulletList.description"),
    keywords: ["lista", "bullet", "marcador", "ul"],
    icon: ICONS.bullet,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    title: t("kindraw.slashCommand.orderedList.title"),
    description: t("kindraw.slashCommand.orderedList.description"),
    keywords: ["lista", "numerada", "ordered", "ol", "numero"],
    icon: ICONS.ordered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "taskList",
    title: t("kindraw.slashCommand.taskList.title"),
    description: t("kindraw.slashCommand.taskList.description"),
    keywords: ["tarefa", "task", "todo", "checkbox", "checklist"],
    icon: ICONS.task,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "blockquote",
    title: t("kindraw.slashCommand.blockquote.title"),
    description: t("kindraw.slashCommand.blockquote.description"),
    keywords: ["citacao", "quote", "blockquote"],
    icon: ICONS.quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "codeBlock",
    title: t("kindraw.slashCommand.codeBlock.title"),
    description: t("kindraw.slashCommand.codeBlock.description"),
    keywords: ["codigo", "code", "snippet"],
    icon: ICONS.code,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "horizontalRule",
    title: t("kindraw.slashCommand.horizontalRule.title"),
    description: t("kindraw.slashCommand.horizontalRule.description"),
    keywords: ["divisor", "divider", "linha", "hr", "separador"],
    icon: ICONS.divider,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

// Normaliza acentos para filtrar "titulo" encontrando "Título".
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const filterCommands = (query: string): SlashCommandItem[] => {
  // Resolve os títulos/descrições no idioma corrente a cada abertura do menu.
  const commands = getSlashCommands();
  const q = normalize(query.trim());
  if (!q) {
    return commands;
  }
  return commands.filter((item) => {
    const haystack = normalize(`${item.title} ${item.keywords.join(" ")}`);
    return haystack.includes(q);
  });
};

// Posiciona o popup ancorado ao cursor, flipando para cima se não couber
// embaixo e grudando dentro da viewport. position: fixed = relativo à viewport,
// então usamos rect.bottom/left diretamente.
const positionPopup = (el: HTMLElement, rect: DOMRect | null) => {
  if (!rect) {
    return;
  }
  const margin = 8;
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.top = "0px";
  el.style.left = "0px";

  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left;
  if (left + width + margin > vw) {
    left = Math.max(margin, vw - width - margin);
  }
  left = Math.max(margin, left);

  const spaceBelow = vh - rect.bottom;
  let top: number;
  if (spaceBelow < height + margin && rect.top > spaceBelow) {
    // não cabe embaixo e há mais espaço em cima → flipa
    top = Math.max(margin, rect.top - height - 4);
  } else {
    top = rect.bottom + 4;
  }

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.visibility = "visible";
};

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashCommandItem;
        }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => filterCommands(query),
        render: () => {
          let component: ReactRenderer<SlashCommandMenuRef> | null = null;

          const update = (props: SuggestionProps<SlashCommandItem>) => {
            const el = component?.element as HTMLElement | undefined;
            if (el) {
              positionPopup(el, props.clientRect?.() ?? null);
            }
          };

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(SlashCommandMenu, {
                props,
                editor: props.editor,
              });
              const el = component.element as HTMLElement;
              // anexa ao body para escapar de overflow:hidden/clipping do editor;
              // z-index alto via classe. Posicionamento manual pelo clientRect.
              el.style.position = "fixed";
              el.style.zIndex = "9999";
              document.body.appendChild(el);
              update(props);
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              component?.updateProps(props);
              update(props);
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                component?.destroy();
                component?.element?.remove();
                component = null;
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              component?.destroy();
              component?.element?.remove();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
