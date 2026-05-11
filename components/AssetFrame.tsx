import path from "node:path";
import fs from "node:fs";
import Image from "next/image";

// Same shape as the inline AssetFrame in the 6 backstage-pass pages.
// Reads the file off disk at build/render time to decide whether to
// render the actual asset or a placeholder card at the asset's native
// aspect ratio. Lets pages ship before screenshots land.

export interface FrameAsset {
  src: string;
  w: number;
  h: number;
}

export function imageExists(publicPath: string): boolean {
  try {
    const abs = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

export function AssetFrame({
  asset,
  kind = "image",
  alt,
  sizes = "(max-width: 640px) 100vw, 672px",
}: {
  asset: FrameAsset;
  kind?: "image" | "gif";
  alt: string;
  sizes?: string;
}) {
  const exists = imageExists(asset.src);
  const filename = asset.src.split("/").pop();
  if (exists) {
    return (
      <Image
        src={asset.src}
        alt={alt}
        width={asset.w}
        height={asset.h}
        sizes={sizes}
        className="w-full h-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
        unoptimized={kind === "gif"}
      />
    );
  }
  return (
    <div
      className="relative w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col items-center justify-center text-center px-4"
      style={{ aspectRatio: `${asset.w} / ${asset.h}` }}
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-1">
        {kind === "gif" ? "GIF goes here" : "Image goes here"}
      </p>
      <p className="text-[10px] text-[var(--foreground-muted)] leading-snug break-all">
        <code className="text-[var(--foreground-muted)]">{filename}</code>
      </p>
    </div>
  );
}
