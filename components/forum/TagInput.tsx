"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}

export default function TagInput({ tags, onChange, max = 10 }: Props) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!tag || tags.includes(tag) || tags.length >= max) return;
    onChange([...tags, tag]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input);
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
        Tags <span className="text-xs opacity-60">(max {max}, press Enter or comma to add)</span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 focus-within:border-[var(--ratist-red)]">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 bg-[var(--surface-2)] text-xs text-white px-2 py-0.5 rounded-full">
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-[var(--foreground-muted)] hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {tags.length < max && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? "Add tags..." : ""}
            className="flex-1 min-w-[80px] bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] outline-none"
          />
        )}
      </div>
    </div>
  );
}
