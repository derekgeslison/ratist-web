"use client";

import Image from "next/image";
import { STREAMING_PROVIDERS, IMAGE_BASE_URL } from "@/lib/tmdb";

interface Props {
  /** Provider names (full TMDB names or short display names) */
  names: string[];
  /** Size of each logo in pixels */
  size?: number;
}

function findProvider(name: string) {
  return STREAMING_PROVIDERS.find(
    (sp) => sp.name === name || sp.short === name
      || name.includes(sp.short) || name.includes(sp.name)
  );
}

export default function ProviderLogos({ names, size = 20 }: Props) {
  if (!names.length) return null;

  return (
    <div className="flex items-center gap-1">
      {names.map((name) => {
        const provider = findProvider(name);
        if (!provider) return (
          <span key={name} className="text-[10px] text-green-400">{name}</span>
        );
        return (
          <Image
            key={provider.id}
            src={`${IMAGE_BASE_URL}/w45${provider.logo}`}
            alt={provider.short}
            title={provider.short}
            width={size}
            height={size}
            className="rounded-[4px]"
          />
        );
      })}
    </div>
  );
}
