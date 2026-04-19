"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";

export interface DebateMessage {
  side: "up" | "down";
  content: string;
}

interface Props {
  messages: DebateMessage[];
}

export default function TwoThumbsDebate({ messages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 60);
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-xl p-6 my-4 text-center text-sm text-[var(--foreground-muted)]">
        No argument messages yet.
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 my-4 relative">
      <div
        ref={containerRef}
        className="max-h-[500px] overflow-y-auto space-y-3 pr-1 relative"
        onScroll={() => {
          const el = containerRef.current;
          if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 60);
        }}
      >
        {messages.map((msg, idx) => {
          const isUp = msg.side === "up";
          return (
            <div key={idx} className={`flex ${isUp ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] flex gap-2 ${isUp ? "flex-row" : "flex-row-reverse"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${isUp ? "border-blue-500/30 bg-blue-600" : "border-[var(--ratist-red)]/30 bg-[var(--ratist-red)]"}`}>
                  {isUp ? <ThumbsUp className="w-3.5 h-3.5 text-white" /> : <ThumbsDown className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className={`rounded-xl px-3 py-2 ${isUp ? "bg-blue-500/10 border border-blue-500/20" : "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/20"}`}>
                  <p className="text-sm text-white/90 whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
            className="sticky bottom-1 left-1/2 -translate-x-1/2 bg-[var(--surface-2)] border border-[var(--border)] rounded-full p-1.5 shadow-lg z-10"
          >
            <ChevronDown className="w-3 h-3 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
