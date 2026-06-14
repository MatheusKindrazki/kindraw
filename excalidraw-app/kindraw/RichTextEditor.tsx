import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

import { KindrawIcon } from "./icons";
import { SlashCommand } from "./SlashCommand";

import type { Editor } from "@tiptap/react";

// tiptap-markdown injeta `storage.markdown` em runtime, mas não expõe tipos.
type MarkdownStorage = {
  markdown?: {
    getMarkdown?: () => string;
    parser?: { parse?: (md: string) => unknown };
  };
};

const getEditorMarkdown = (editor: Editor): string => {
  const storage = editor.storage as MarkdownStorage;
  return storage.markdown?.getMarkdown?.() ?? "";
};

// Editor WYSIWYG "headless" estilo Outline: sem toolbar fixa. Formatação por
// markdown shortcuts ao digitar, bubble menu na seleção e menu de blocos em
// linha vazia. Lê/escreve Markdown por baixo (preview público, share, persistência
// continuam em md). Colar texto é sempre interpretado como Markdown.

type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
};

const MenuButton = ({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    aria-label={label}
    aria-pressed={active}
    className={`kindraw-rte__menu-btn${
      active ? " kindraw-rte__menu-btn--active" : ""
    }`}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    title={label}
    type="button"
  >
    {children}
  </button>
);

export const RichTextEditor = ({
  value,
  onChange,
  placeholder = "Escreva aqui…",
  editable = true,
}: RichTextEditorProps) => {
  // Distingue mudanças internas (digitação) de externas (troca de documento)
  // para só re-setar o conteúdo no segundo caso.
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    editable,
    extensions: [
      // StarterKit 3 já traz underline e horizontalRule embutidos.
      StarterKit.configure({
        link: {
          openOnClick: false,
        },
      }),
      Highlight,
      // nested: true permite aninhar tarefas; o tiptap-markdown serializa
      // task items como "- [ ]" / "- [x]", então sobrevivem ao round-trip.
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand,
      Markdown.configure({
        html: false,
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "kindraw-rte__content",
        "aria-label": placeholder,
      },
      // Colar texto puro = interpretar como Markdown e inserir já formatado.
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }
        // Se há HTML no clipboard (cópia rica), deixa o fluxo padrão tratar.
        if (clipboard.types.includes("text/html")) {
          return false;
        }
        const text = clipboard.getData("text/plain");
        if (!text) {
          return false;
        }
        event.preventDefault();
        // insertContent com string passa pelo parser de markdown do tiptap-markdown
        editorRef.current?.commands.insertContent(text);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = getEditorMarkdown(current);
      lastEmittedRef.current = markdown;
      onChange(markdown);
    },
  });

  // Ref estável para usar o editor dentro de handlers de editorProps.
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Parse correto do markdown inicial no mount.
  useEffect(() => {
    if (editor && value) {
      editor.commands.setContent(value);
      lastEmittedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Sincroniza com mudanças externas de `value`.
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (value !== lastEmittedRef.current) {
      editor.commands.setContent(value);
      lastEmittedRef.current = value;
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className="kindraw-rte kindraw-rte--headless">
      {editable && editor ? (
        <>
          <BubbleMenu
            editor={editor}
            className="kindraw-rte__bubble"
            options={{ placement: "top" }}
          >
            <MenuButton
              active={editor.isActive("bold")}
              label="Negrito"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <strong>B</strong>
            </MenuButton>
            <MenuButton
              active={editor.isActive("italic")}
              label="Itálico"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <em>I</em>
            </MenuButton>
            <MenuButton
              active={editor.isActive("underline")}
              label="Sublinhado"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <span style={{ textDecoration: "underline" }}>U</span>
            </MenuButton>
            <MenuButton
              active={editor.isActive("strike")}
              label="Riscado"
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <s>S</s>
            </MenuButton>
            <MenuButton
              active={editor.isActive("highlight")}
              label="Realce"
              onClick={() => editor.chain().focus().toggleHighlight().run()}
            >
              <mark className="kindraw-rte__menu-mark">H</mark>
            </MenuButton>
            <MenuButton
              active={editor.isActive("code")}
              label="Código"
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              {"</>"}
            </MenuButton>
            <span className="kindraw-rte__menu-sep" />
            <MenuButton
              active={editor.isActive("link")}
              label="Link"
              onClick={() => {
                const previous = editor.getAttributes("link").href as
                  | string
                  | undefined;
                const url = window.prompt("URL do link", previous || "https://");
                if (url === null) {
                  return;
                }
                if (url === "") {
                  editor.chain().focus().unsetLink().run();
                  return;
                }
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
              }}
            >
              <KindrawIcon name="link" size={14} />
            </MenuButton>
          </BubbleMenu>
        </>
      ) : null}
      <EditorContent className="kindraw-rte__surface" editor={editor} />
    </div>
  );
};
