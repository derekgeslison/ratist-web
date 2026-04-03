"use client";

import { useRef, useEffect, useState } from "react";
import { Send, ChevronDown } from "lucide-react";
import { rtdb } from "@/lib/firebase-rtdb";
import { ref, push } from "firebase/database";
import { rtdbPaths, type RTDBChatMessage } from "@/lib/screening";

const QUICK_EMOJIS = ["👍", "👎", "😂", "🔥", "❤️"];

interface Props {
  sessionId: string;
  myUserId: string;
  myName: string;
  myPhotoURL?: string;
  chatMessages: (RTDBChatMessage & { key: string })[];
  maxHeight?: string;
  label?: string;
  phase?: "lobby" | "postwatch";
}

export default function CompactChat({ sessionId, myUserId, myName, myPhotoURL, chatMessages, maxHeight = "200px", label = "Chat", phase }: Props) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 60);
  }

  function scrollToBottom() {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function sendMessage(text: string, emoji?: string) {
    if (!rtdb || !myUserId) return;
    const msg: Record<string, unknown> = {
      userId: myUserId,
      userName: myName,
      text: text || "",
      timestamp: Date.now(),
    };
    if (myPhotoURL) msg.avatarUrl = myPhotoURL;
    if (emoji) msg.emoji = emoji;
    if (phase) msg.phase = phase;
    try {
      await push(ref(rtdb, rtdbPaths.chat(sessionId)), msg);
    } catch { /* ignore */ }
    if (inputRef.current) inputRef.current.value = "";
  }

  function sendFromInput() {
    const val = inputRef.current?.value?.trim();
    if (!val) return;
    sendMessage(val);
  }

  // Filter out system messages for compact view
  const userMessages = chatMessages.filter((m) => m.userId !== "system" && !(m as any).system);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <p className="text-[10px] text-[var(--foreground-muted)] px-3 py-2 border-b border-[var(--border)]">{label}</p>

      {/* Messages */}
      <div ref={containerRef} onScroll={handleScroll}
        className="overflow-y-auto px-3 py-2 space-y-1.5 relative" style={{ maxHeight }}>
        {userMessages.length === 0 && (
          <p className="text-[10px] text-[var(--foreground-muted)] text-center py-2">No messages yet</p>
        )}
        {userMessages.map((msg) => {
          const isMine = msg.userId === myUserId;
          return (
            <div key={msg.key} data-msg-ts={msg.timestamp} className={`flex items-start gap-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 ${isMine ? "bg-[var(--ratist-red)]/20" : "bg-[var(--surface-2)]"}`}>
                {!isMine && <p className="text-[9px] text-[var(--foreground-muted)]">{msg.userName}</p>}
                {msg.emoji ? <span className="text-lg">{msg.emoji}</span> : <p className="text-xs text-white">{msg.text}</p>}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />

        {/* Scroll to bottom */}
        {showScrollBtn && (
          <button onClick={scrollToBottom}
            className="sticky bottom-1 left-1/2 -translate-x-1/2 bg-[var(--surface-2)] border border-[var(--border)] rounded-full p-1.5 shadow-lg z-10">
            <ChevronDown className="w-3 h-3 text-white" />
          </button>
        )}
      </div>

      {/* Quick emojis + input */}
      <div className="border-t border-[var(--border)]">
        <div className="flex items-center gap-1 px-3 py-1">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => sendMessage("", e)} className="text-sm hover:scale-110 transition-transform">{e}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)]">
          <input ref={inputRef} type="text" defaultValue=""
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendFromInput(); } }}
            placeholder="Type a message..."
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
          <button onClick={sendFromInput}
            className="bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white p-1.5 rounded-lg transition-colors">
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
