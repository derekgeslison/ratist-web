"use client";

const TYPE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  discussion: { label: "Discussion", color: "text-gray-300", bg: "bg-gray-500/20" },
  theory: { label: "Theory", color: "text-purple-400", bg: "bg-purple-500/20" },
  poll: { label: "Poll", color: "text-blue-400", bg: "bg-blue-500/20" },
  recommendation: { label: "Recommendation", color: "text-green-400", bg: "bg-green-500/20" },
  debate: { label: "Debate", color: "text-orange-400", bg: "bg-orange-500/20" },
};

export default function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.discussion;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.color} ${style.bg}`}>
      {style.label}
    </span>
  );
}
