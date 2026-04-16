"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";

/* ─── React component rendered for each image node ─────────────────────── */

function ImageComponent({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const { src, alt, title, width, display } = node.attrs as {
    src: string; alt?: string; title?: string; width?: number; display?: string;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);

      const startX = e.clientX;
      const startWidth = containerRef.current?.getBoundingClientRect().width ?? 300;

      function onMouseMove(ev: MouseEvent) {
        const diff = ev.clientX - startX;
        const newWidth = Math.max(12, Math.round(startWidth + diff));
        updateAttributes({ width: newWidth });
      }
      function onMouseUp() {
        setResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [updateAttributes],
  );

  const isInline = display === "inline";

  return (
    <NodeViewWrapper
      as="span"
      className={`relative group ${isInline ? "inline-block align-middle" : "block"}`}
      style={{ width: width ? `${width}px` : undefined, maxWidth: "100%" }}
      ref={containerRef}
      data-drag-handle=""
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        title={title ?? undefined}
        className="w-full rounded-lg"
        draggable={false}
      />

      {/* Selection outline + controls */}
      {selected && (
        <>
          <div className="absolute inset-0 rounded-lg ring-2 ring-[var(--ratist-red)] pointer-events-none" />

          {/* Size preset buttons */}
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-1.5 py-1 shadow-lg z-30">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const editorEl = containerRef.current?.closest(".ProseMirror");
                  if (!editorEl) return;
                  const editorWidth = editorEl.getBoundingClientRect().width - 32; // minus padding
                  updateAttributes({ width: Math.round(editorWidth * (pct / 100)) });
                }}
                className="px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] rounded transition-colors"
              >
                {pct}%
              </button>
            ))}
            <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateAttributes({ display: isInline ? "block" : "inline" });
              }}
              className="px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] rounded transition-colors"
              title={isInline ? "Switch to block" : "Switch to inline"}
            >
              {isInline ? "Block" : "Inline"}
            </button>
          </div>

          {/* Resize handle (bottom-right corner) */}
          <div
            onMouseDown={onMouseDown}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20"
          >
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-white/80 rounded-br-sm" />
          </div>
        </>
      )}

      {/* Subtle resize indicator on hover (when not selected) */}
      {!selected && (
        <div className="absolute bottom-0 right-0 w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity">
          <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-white/50 rounded-br-sm" />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* ─── Custom Tiptap Image extension with resize + inline support ───────── */

const ResizableImage = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = (el as HTMLElement).style?.width;
          if (w && w.endsWith("px")) return parseInt(w, 10);
          return (el as HTMLElement).getAttribute("width")
            ? parseInt((el as HTMLElement).getAttribute("width")!, 10)
            : null;
        },
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
      },
      display: {
        default: "block",
        parseHTML: (el) => ((el as HTMLElement).style?.display === "inline-block" ? "inline" : "block"),
        renderHTML: (attrs) =>
          attrs.display === "inline" ? { style: "display: inline-block" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { display, width, ...rest } = HTMLAttributes;
    const styles: string[] = [];
    if (width) styles.push(`width: ${width}px`);
    if (display === "inline") styles.push("display: inline-block");
    const attrs = { ...rest, class: "rounded-lg max-w-full" };
    if (styles.length) (attrs as any).style = styles.join("; ");
    return ["img", mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});

export default ResizableImage;
