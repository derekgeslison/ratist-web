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
import FontFamily from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import DebateBlock from "./DebateBlock";
import { FontSize } from "./rte-extensions";

interface Props {
  content: string;
}

export default function RichTextRenderer({ content }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TiptapLink.configure({ HTMLAttributes: { class: "text-[var(--ratist-red)] underline hover:opacity-80" } }),
      TiptapImage.configure({
        inline: true,
        HTMLAttributes: { class: "max-w-full rounded-lg" },
      }).extend({
        group: "inline",
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: null,
              parseHTML: (el: HTMLElement) => {
                const w = el.style?.width;
                return w && w.endsWith("px") ? parseInt(w, 10) : el.getAttribute("width") ? parseInt(el.getAttribute("width")!, 10) : null;
              },
              renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
            },
            display: {
              default: "block",
              parseHTML: (el: HTMLElement) => (el.style?.display === "inline-block" ? "inline" : "block"),
              renderHTML: (attrs: Record<string, unknown>) => (attrs.display === "inline" ? { style: "display: inline-block" } : {}),
            },
          };
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      Subscript,
      Superscript,
      FontSize,
      DebateBlock,
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
