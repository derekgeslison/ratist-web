"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Table as TableIcon, Link as LinkIcon, Highlighter,
  Undo, Redo,
} from "lucide-react";

interface Props {
  content: string;
  onChange: (json: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ content, onChange, placeholder = "Start writing…" }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-[var(--ratist-red)] underline" } }),
      Image.configure({ HTMLAttributes: { class: "max-w-full rounded-lg my-4" } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: content ? JSON.parse(content) : "",
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none min-h-[400px] px-4 py-3 focus:outline-none text-white",
      },
    },
  });

  if (!editor) return null;

  function insertImage() {
    const url = window.prompt("Image URL:");
    if (url) editor!.chain().focus().setImage({ src: url }).run();
  }

  function setLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL:", prev ?? "");
    if (url === null) return;
    if (url === "") { editor!.chain().focus().unsetLink().run(); return; }
    editor!.chain().focus().setLink({ href: url }).run();
  }

  function insertTable() {
    editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  const btn = (active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)]"}`;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        {/* History */}
        <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={btn(false)} title="Undo">
          <Undo className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={btn(false)} title="Redo">
          <Redo className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Headings */}
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive("heading", { level: 1 }))} title="H1">
          <Heading1 className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="H2">
          <Heading2 className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} title="H3">
          <Heading3 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Marks */}
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="Bold"><Bold className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="Italic"><Italic className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} title="Underline"><UnderlineIcon className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive("code"))} title="Inline code"><Code className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive("highlight"))} title="Highlight"><Highlighter className="w-4 h-4" /></button>

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Alignment */}
        <button onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))} title="Left"><AlignLeft className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))} title="Center"><AlignCenter className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btn(editor.isActive({ textAlign: "right" }))} title="Right"><AlignRight className="w-4 h-4" /></button>

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Lists & blocks */}
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="Bullet list"><List className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="Ordered list"><ListOrdered className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} title="Blockquote"><Quote className="w-4 h-4" /></button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Divider"><Minus className="w-4 h-4" /></button>

        <div className="w-px h-5 bg-[var(--border)] mx-1" />

        {/* Inserts */}
        <button onClick={setLink} className={btn(editor.isActive("link"))} title="Link"><LinkIcon className="w-4 h-4" /></button>
        <button onClick={insertImage} className={btn(false)} title="Image"><ImageIcon className="w-4 h-4" /></button>
        <button onClick={insertTable} className={btn(false)} title="Table"><TableIcon className="w-4 h-4" /></button>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
