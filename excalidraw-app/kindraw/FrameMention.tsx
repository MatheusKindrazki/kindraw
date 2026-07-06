import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

import { t } from "@excalidraw/excalidraw/i18n";

import { positionPopup } from "./SlashCommand";
import { SlashCommandMenu } from "./SlashCommandMenu";

import type { SlashCommandItem } from "./SlashCommand";
import type { SlashCommandMenuRef } from "./SlashCommandMenu";
import type { Editor, Range } from "@tiptap/core";
import type { SuggestionProps } from "@tiptap/suggestion";

// Referência a um frame do canvas, exposta pelo editor hybrid.
export type FrameRef = { id: string; name: string };

// Menções a frame viram um link com este esquema. Round-trip em Markdown como
// [◳ Nome](kindraw://frame/<id>); o clique é interceptado (não navega) para dar
// foco no frame do canvas. Ver RichTextEditor (editor) e MarkdownPreview (preview).
export const FRAME_LINK_PREFIX = "kindraw://frame/";

export const parseFrameLink = (href: string): string | null =>
  href.startsWith(FRAME_LINK_PREFIX)
    ? href.slice(FRAME_LINK_PREFIX.length) || null
    : null;

const frameIcon = (
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
    <path d="M8 3v18M16 3v18M3 8h18M3 16h18" opacity="0.45" />
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </svg>
);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const buildFrameItems = (
  frames: FrameRef[],
  query: string,
): SlashCommandItem[] => {
  const q = normalize(query.trim());
  const filtered = q
    ? frames.filter((frame) => normalize(frame.name).includes(q))
    : frames;

  return filtered.map((frame) => ({
    id: frame.id,
    title: frame.name,
    description: t("kindraw.frameMention.hint"),
    keywords: [],
    icon: frameIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "text",
            text: `◳ ${frame.name}`,
            marks: [
              {
                type: "link",
                attrs: { href: `${FRAME_LINK_PREFIX}${frame.id}` },
              },
            ],
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  }));
};

export type FrameMentionOptions = {
  getFrames: () => FrameRef[];
};

// pluginKey PRÓPRIA: sem isso o @tiptap/suggestion registra o plugin com a key
// default ("suggestion$"), colidindo com o SlashCommand ("/") e derrubando o
// editor ("Adding different instances of a keyed plugin").
const frameMentionPluginKey = new PluginKey("frameMention");

// Suggestion "@" que lista os frames do canvas. Espelha a mecânica do
// SlashCommand ("/"), reusando o popup (SlashCommandMenu) e o posicionamento.
export const FrameMention = Extension.create<FrameMentionOptions>({
  name: "frameMention",

  addOptions() {
    return {
      getFrames: () => [],
    };
  },

  addProseMirrorPlugins() {
    const getFrames = () => this.options.getFrames();

    return [
      Suggestion<SlashCommandItem>({
        pluginKey: frameMentionPluginKey,
        editor: this.editor,
        char: "@",
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
        items: ({ query }: { query: string }) =>
          buildFrameItems(getFrames(), query),
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
