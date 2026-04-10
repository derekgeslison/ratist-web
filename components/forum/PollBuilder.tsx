"use client";

import { Plus, X } from "lucide-react";

interface Props {
  options: string[];
  onChange: (options: string[]) => void;
}

export default function PollBuilder({ options, onChange }: Props) {
  function updateOption(index: number, value: string) {
    const updated = [...options];
    updated[index] = value;
    onChange(updated);
  }

  function addOption() {
    if (options.length >= 10) return;
    onChange([...options, ""]);
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
        Poll Options <span className="text-xs opacity-60">(2-10 options)</span>
      </label>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={200}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            {options.length > 2 && (
              <button type="button" onClick={() => removeOption(i)} className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add option
          </button>
        )}
      </div>
    </div>
  );
}
