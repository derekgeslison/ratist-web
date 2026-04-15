"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
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

interface Props {
  content: string;
}

export default function RichTextRenderer({ content }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TiptapLink.configure({ HTMLAttributes: { class: "text-[var(--ratist-red)] underline hover:opacity-80" } }),
      TiptapImage.configure({ HTMLAttributes: { class: "max-w-full rounded-lg my-4" } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
    ],
    content: content ? JSON.parse(content) : "",
    editable: false,
    editorProps: {
      attributes: {
        class: "max-w-none text-[var(--foreground)] leading-relaxed",
      },
    },
  });

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
