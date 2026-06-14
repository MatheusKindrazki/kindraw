import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

import { KindrawIcon } from "./icons";

import type { Editor } from "@tiptap/react";

// tiptap-markdown injeta `storage.markdown.getMarkdown()` em runtime, mas não
// expõe tipos; lê o markdown atual do editor com um cast estreito.
const getEditorMarkdown = (editor: Editor): string => {
  const storage = editor.storage as {
    markdown?: { getMarkdown?: () => string };
  };
  return storage.markdown?.getMarkdown?.() ?? "";
};

// Editor WYSIWYG (campo livre, estilo Notion) que lê e escreve Markdown por
// baixo — assim o que já existe (preview público, share, persistência como md)
// segue funcionando. Substitui o split CodeMirror + preview.

type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Markdown inicial; usado só para detectar trocas de documento externas. */
};

const ToolbarButton = ({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    aria-label={label}
    aria-pressed={active}
    className={`kindraw-rte__tool${
      active ? " kindraw-rte__tool--active" : ""
    }`}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    title={label}
    type="button"
  >
    {children}
  </button>
);

const Toolbar = ({ editor }: { editor: Editor }) => (
  <div className="kindraw-rte__toolbar">
    <ToolbarButton
      active={editor.isActive("heading", { level: 1 })}
      label="Título 1"
      onClick={() =>
        editor.chain().focus().toggleHeading({ level: 1 }).run()
      }
    >
      H1
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("heading", { level: 2 })}
      label="Título 2"
      onClick={() =>
        editor.chain().focus().toggleHeading({ level: 2 }).run()
      }
    >
      H2
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("heading", { level: 3 })}
      label="Título 3"
      onClick={() =>
        editor.chain().focus().toggleHeading({ level: 3 }).run()
      }
    >
      H3
    </ToolbarButton>
    <span className="kindraw-rte__sep" />
    <ToolbarButton
      active={editor.isActive("bold")}
      label="Negrito"
      onClick={() => editor.chain().focus().toggleBold().run()}
    >
      <strong>B</strong>
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("italic")}
      label="Itálico"
      onClick={() => editor.chain().focus().toggleItalic().run()}
    >
      <em>I</em>
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("strike")}
      label="Riscado"
      onClick={() => editor.chain().focus().toggleStrike().run()}
    >
      <s>S</s>
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("code")}
      label="Código inline"
      onClick={() => editor.chain().focus().toggleCode().run()}
    >
      {"</>"}
    </ToolbarButton>
    <span className="kindraw-rte__sep" />
    <ToolbarButton
      active={editor.isActive("bulletList")}
      label="Lista"
      onClick={() => editor.chain().focus().toggleBulletList().run()}
    >
      <KindrawIcon name="dots" size={16} />
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("orderedList")}
      label="Lista numerada"
      onClick={() => editor.chain().focus().toggleOrderedList().run()}
    >
      1.
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("blockquote")}
      label="Citação"
      onClick={() => editor.chain().focus().toggleBlockquote().run()}
    >
      &ldquo;
    </ToolbarButton>
    <ToolbarButton
      active={editor.isActive("codeBlock")}
      label="Bloco de código"
      onClick={() => editor.chain().focus().toggleCodeBlock().run()}
    >
      {"{}"}
    </ToolbarButton>
  </div>
);

export const RichTextEditor = ({
  value,
  onChange,
  placeholder = "Escreva aqui…",
  editable = true,
}: RichTextEditorProps) => {
  // Guarda o último markdown emitido pelo próprio editor, para distinguir
  // mudanças internas (digitação) de mudanças externas (troca de documento,
  // autosave restaurado) e só re-setar o conteúdo no segundo caso.
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        linkify: true,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "kindraw-rte__content",
        "aria-label": placeholder,
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = getEditorMarkdown(current);
      lastEmittedRef.current = markdown;
      onChange(markdown);
    },
  });

  // Tiptap parseia o `content` inicial via prosemirror, não via markdown.
  // Garante o parse correto de markdown no primeiro carregamento.
  useEffect(() => {
    if (editor && value) {
      editor.commands.setContent(value);
      lastEmittedRef.current = value;
    }
    // só no mount do editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Sincroniza quando `value` muda por fonte externa (não pela própria edição).
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
    <div className="kindraw-rte">
      {editable && editor ? <Toolbar editor={editor} /> : null}
      <EditorContent className="kindraw-rte__surface" editor={editor} />
    </div>
  );
};
