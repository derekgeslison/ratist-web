"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ResizableImage from "./ResizableImage";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import TiptapLink from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Table as TableIcon, Link as LinkIcon, Highlighter,
  Undo, Redo, Upload, Palette, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
} from "lucide-react";

interface Props {
  content: string;
  onChange: (json: string) => void;
  placeholder?: string;
}

const HIGHLIGHT_COLORS = [
  { label: "Yellow", color: "#fde047" },
  { label: "Green", color: "#86efac" },
  { label: "Blue", color: "#93c5fd" },
  { label: "Pink", color: "#f9a8d4" },
  { label: "Orange", color: "#fdba74" },
  { label: "Red", color: "#fca5a5" },
];

const TEXT_COLORS = [
  { label: "Default", color: "" },
  { label: "Red", color: "#ef4444" },
  { label: "Orange", color: "#f97316" },
  { label: "Yellow", color: "#eab308" },
  { label: "Green", color: "#22c55e" },
  { label: "Blue", color: "#3b82f6" },
  { label: "Purple", color: "#a855f7" },
  { label: "Pink", color: "#ec4899" },
  { label: "White", color: "#ffffff" },
  { label: "Gray", color: "#a0a0a0" },
];

export default function RichTextEditor({ content, onChange, placeholder = "Start writing..." }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TiptapLink.configure({ openOnClick: false, HTMLAttributes: { class: "text-[var(--ratist-red)] underline" } }),
      ResizableImage,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content: content ? JSON.parse(content) : "",
    onUpdate: ({ editor: e }) => {
      onChange(JSON.stringify(e.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "max-w-none min-h-[400px] px-4 py-3 focus:outline-none text-white",
      },
    },
  });

  const handleImageUpload = useCallback(async (file: File) => {
    if (!user || !editor) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }

    setUploading(true);
    try {
      const token = await user.getIdToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const { url } = await res.json();
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Upload failed");
      }
    } catch {
      alert("Upload failed");
    }
    setUploading(false);
  }, [user, editor]);

  if (!editor) return null;

  function insertImageFromUrl() {
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
    const rows = parseInt(window.prompt("Rows:", "3") ?? "", 10);
    const cols = parseInt(window.prompt("Columns:", "3") ?? "", 10);
    if (!rows || !cols || rows < 1 || cols < 1) return;
    editor!.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }

  const isInTable = editor.isActive("table");

  const btn = (active: boolean, disabled?: boolean) =>
    `p-1.5 rounded transition-colors ${disabled ? "opacity-30 cursor-not-allowed" : ""} ${active ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)]"}`;

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] sticky top-0 z-20 rounded-t-xl">
        {/* History */}
        <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={btn(false, !editor.can().undo())} title="Undo">
          <Undo className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={btn(false, !editor.can().redo())} title="Redo">
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

        {/* Highlight with color picker */}
        <div className="relative">
          <button onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); setShowTableMenu(false); }} className={btn(editor.isActive("highlight"))} title="Highlight">
            <Highlighter className="w-4 h-4" />
          </button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl z-30 p-2 flex gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.color}
                  onClick={() => { editor.chain().focus().toggleHighlight({ color: c.color }).run(); setShowHighlightPicker(false); }}
                  className="w-6 h-6 rounded border border-[var(--border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
              <button
                onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false); }}
                className="w-6 h-6 rounded border border-[var(--border)] text-[10px] text-[var(--foreground-muted)] hover:text-white flex items-center justify-center"
                title="Remove highlight"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* Text color */}
        <div className="relative">
          <button onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); setShowTableMenu(false); }} className={btn(!!editor.getAttributes("textStyle").color)} title="Text color">
            <Palette className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl z-30 p-2 flex gap-1 flex-wrap w-32">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color || "default"}
                  onClick={() => {
                    if (c.color) editor.chain().focus().setColor(c.color).run();
                    else editor.chain().focus().unsetColor().run();
                    setShowColorPicker(false);
                  }}
                  className="w-6 h-6 rounded border border-[var(--border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.color || "var(--foreground)" }}
                  title={c.label}
                />
              ))}
            </div>
          )}
        </div>

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

        {/* Image: upload button + URL fallback */}
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className={btn(false, uploading)} title="Upload image">
          {uploading ? <span className="w-4 h-4 block border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
        </button>
        <button onClick={insertImageFromUrl} className={btn(false)} title="Image from URL"><ImageIcon className="w-4 h-4" /></button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
        />

        {/* Table */}
        <div className="relative">
          <button onClick={() => { if (isInTable) { setShowTableMenu(!showTableMenu); setShowHighlightPicker(false); setShowColorPicker(false); } else insertTable(); }} className={btn(isInTable)} title={isInTable ? "Table options" : "Insert table"}>
            <TableIcon className="w-4 h-4" />
          </button>
          {showTableMenu && isInTable && (
            <div className="absolute top-full right-0 mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl z-30 p-1.5 w-48 space-y-0.5">
              <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] rounded transition-colors">
                <ArrowRight className="w-3 h-3" /> Add column after
              </button>
              <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] rounded transition-colors">
                <ArrowLeft className="w-3 h-3" /> Add column before
              </button>
              <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] rounded transition-colors">
                <ArrowDown className="w-3 h-3" /> Add row after
              </button>
              <button onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] rounded transition-colors">
                <ArrowUp className="w-3 h-3" /> Add row before
              </button>
              <div className="border-t border-[var(--border)] my-1" />
              <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors">
                <Trash2 className="w-3 h-3" /> Delete column
              </button>
              <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors">
                <Trash2 className="w-3 h-3" /> Delete row
              </button>
              <button onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors">
                <Trash2 className="w-3 h-3" /> Delete table
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
