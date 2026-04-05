"use client";

import Image from "next/image";
import { IMAGE_BASE_URL } from "@/lib/tmdb";

export interface ProviderInfo {
  name: string;
  logo: string; // TMDB logo_path e.g. "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
}

interface Props {
  providers: ProviderInfo[];
  size?: number;
  label?: "Stream" | "Rent";
}

export default function ProviderLogos({ providers, size = 20, label }: Props) {
  if (!providers.length) return null;

  return (
    <div className="flex items-center gap-1">
      {label && (
        <span className={`text-[10px] font-medium mr-0.5 ${label === "Stream" ? "text-green-400" : "text-blue-400"}`}>
          {label}
        </span>
      )}
      {providers.map((p, i) => (
        <Image
          key={`${p.name}-${i}`}
          src={`${IMAGE_BASE_URL}/w45${p.logo}`}
          alt={p.name}
          title={p.name}
          width={size}
          height={size}
          className="rounded-[4px]"
        />
      ))}
    </div>
  );
}
