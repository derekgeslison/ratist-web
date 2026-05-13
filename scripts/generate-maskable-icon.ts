/**
 * Generates /public/icon-512-maskable.png from the existing logo.
 *
 * Maskable icons need a safe zone — Android's adaptive icon system masks
 * the image with various shapes (circle, squircle, rounded square). The
 * recommended safe zone is the central 80% (i.e. the icon content must
 * fit inside the inner 80% so masks don't clip anything important).
 *
 * Strategy: fill 512x512 canvas with brand dark background, scale logo
 * to ~70% of canvas, composite centered.
 *
 * Run: npx tsx scripts/generate-maskable-icon.ts
 */
import sharp from "sharp";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SRC = path.join(PUBLIC_DIR, "logo.png");
const OUT = path.join(PUBLIC_DIR, "icon-512-maskable.png");

const CANVAS = 512;
const SAFE_PCT = 0.70;
const INNER = Math.round(CANVAS * SAFE_PCT);
const BG = { r: 15, g: 15, b: 15, alpha: 1 };

async function main() {
  const logoResized = await sharp(SRC)
    .resize(INNER, INNER, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const meta = await sharp(logoResized).metadata();
  const logoW = meta.width ?? INNER;
  const logoH = meta.height ?? INNER;
  const left = Math.round((CANVAS - logoW) / 2);
  const top = Math.round((CANVAS - logoH) / 2);

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logoResized, left, top }])
    .png()
    .toFile(OUT);

  console.log(`Wrote ${OUT}`);
  console.log(`  canvas ${CANVAS}x${CANVAS}, logo ${logoW}x${logoH} at (${left},${top})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
