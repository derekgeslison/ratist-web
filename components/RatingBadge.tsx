import Image from "next/image";
import { scoreColor } from "@/lib/ratings";

interface Props {
  type: "community" | "ratist";
  score: number | null;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { text: "text-xs", icon: 12, gap: "gap-1" },
  md: { text: "text-sm", icon: 16, gap: "gap-1.5" },
  lg: { text: "text-base", icon: 20, gap: "gap-2" },
};

export default function RatingBadge({ type, score, size = "md" }: Props) {
  const { text, icon, gap } = sizes[size];
  const color = score != null ? scoreColor(score) : "#6b7280";
  const display = score != null ? score.toFixed(1) : "—";

  if (type === "community") {
    return (
      <span className={`inline-flex items-center ${gap} font-semibold`}>
        <span className="text-yellow-400">★</span>
        <span className={`${text}`} style={{ color }}>
          {display}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${gap} font-semibold`}>
      <Image src="/logo.png" alt="Ratist" width={icon} height={icon} className="opacity-90" />
      <span className={`${text}`} style={{ color }}>
        {display}
      </span>
    </span>
  );
}
