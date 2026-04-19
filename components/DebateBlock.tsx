"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { ThumbsUp, ThumbsDown, ArrowUp, ArrowDown, Trash2, Plus, Pencil, Eye } from "lucide-react";
import TwoThumbsDebate, { type DebateMessage } from "./TwoThumbsDebate";

function DebateBlockComponent({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const messages = (node.attrs.messages as DebateMessage[] | null) ?? [];
  const [editMode, setEditMode] = useState(messages.length === 0);
  const isEditable = editor.isEditable;

  function setMessages(next: DebateMessage[]) {
    updateAttributes({ messages: next });
  }

  function addMessage(side: "up" | "down") {
    setMessages([...messages, { side, content: "" }]);
  }

  function updateMessage(idx: number, patch: Partial<DebateMessage>) {
    setMessages(messages.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function removeMessage(idx: number) {
    setMessages(messages.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= messages.length) return;
    const next = [...messages];
    [next[idx], next[j]] = [next[j], next[idx]];
    setMessages(next);
  }

  const upCount = messages.filter((m) => m.side === "up").length;
  const downCount = messages.filter((m) => m.side === "down").length;

  if (!isEditable) {
    return (
      <NodeViewWrapper className="my-4" contentEditable={false}>
        <TwoThumbsDebate messages={messages} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="my-4" contentEditable={false}>
      <div className="border-2 border-dashed border-[var(--ratist-red)]/40 rounded-xl p-3 bg-[var(--ratist-red)]/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ratist-red)] uppercase tracking-wide">
            <ThumbsUp className="w-3.5 h-3.5" /> Two Thumbs Argument
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--foreground-muted)] mr-2">
              {upCount} · {downCount}
            </span>
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] rounded transition-colors"
            >
              {editMode ? <><Eye className="w-3 h-3" /> Preview</> : <><Pencil className="w-3 h-3" /> Edit</>}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this argument block?")) deleteNode();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {editMode ? (
          <>
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)] text-center py-4">
                No messages yet. Add one from either side to start the argument.
              </p>
            ) : (
              <div className="space-y-2">
                {messages.map((msg, idx) => {
                  const isUp = msg.side === "up";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2 p-2 rounded-lg border ${isUp ? "bg-blue-500/5 border-blue-500/20" : "bg-[var(--ratist-red)]/5 border-[var(--ratist-red)]/20"}`}
                    >
                      <button
                        type="button"
                        onClick={() => updateMessage(idx, { side: isUp ? "down" : "up" })}
                        title="Flip side"
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-colors ${isUp ? "bg-blue-600 border-blue-500/50 hover:opacity-80" : "bg-[var(--ratist-red)] border-[var(--ratist-red)]/50 hover:opacity-80"}`}
                      >
                        {isUp ? <ThumbsUp className="w-4 h-4 text-white" /> : <ThumbsDown className="w-4 h-4 text-white" />}
                      </button>
                      <textarea
                        value={msg.content}
                        onChange={(e) => updateMessage(idx, { content: e.target.value })}
                        placeholder={isUp ? "In favor..." : "Against..."}
                        rows={2}
                        className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y min-h-[44px]"
                      />
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(idx, 1)}
                          disabled={idx === messages.length - 1}
                          className="p-1 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMessage(idx)}
                          className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete message"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => addMessage("up")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> <ThumbsUp className="w-3 h-3" /> Add
              </button>
              <button
                type="button"
                onClick={() => addMessage("down")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ratist-red)]/20 hover:bg-[var(--ratist-red)]/30 border border-[var(--ratist-red)]/30 rounded-lg text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> <ThumbsDown className="w-3 h-3" /> Add
              </button>
            </div>
          </>
        ) : (
          <TwoThumbsDebate messages={messages} />
        )}
      </div>
    </NodeViewWrapper>
  );
}

const DebateBlock = Node.create({
  name: "debateBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      messages: {
        default: [] as DebateMessage[],
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute("data-messages");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          "data-messages": JSON.stringify(attrs.messages ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-debate-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-debate-block": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DebateBlockComponent);
  },

  addCommands() {
    return {
      insertDebateBlock:
        () =>
        ({ commands }: { commands: { insertContent: (content: unknown) => boolean } }) =>
          commands.insertContent({ type: this.name, attrs: { messages: [] } }),
    } as Record<string, (...args: unknown[]) => unknown>;
  },
});

export default DebateBlock;
