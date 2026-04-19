"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import PostIdeaSubmitModal from "./PostIdeaSubmitModal";

interface Props {
  type: "PUNCH_AND_JUDY" | "MOVIE_MAP";
  label: string;
}

export default function SuggestIdeaButton({ type, label }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors shrink-0"
        title={`Suggest a ${label} topic`}
      >
        <Lightbulb className="w-3.5 h-3.5" />
        Suggest an idea
      </button>
      {open && <PostIdeaSubmitModal type={type} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}
