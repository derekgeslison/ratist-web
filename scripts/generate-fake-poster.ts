// Renders the /about page's fake "The Predicted One" movie poster
// as a static PNG so layout doesn't break when font metrics differ
// or the container is too narrow for the credit text.
//
// Output: public/about/fake-poster.png
// Run: cd web && npx tsx scripts/generate-fake-poster.ts

import sharp from "sharp";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(ROOT, "public/about");
const OUT = path.join(OUT_DIR, "fake-poster.png");

const W = 400;
const H = 600;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3a0e1c"/>
          <stop offset="50%" stop-color="#1a0508"/>
          <stop offset="100%" stop-color="#000000"/>
        </linearGradient>
        <radialGradient id="spotlight" cx="50%" cy="20%" r="40%">
          <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="floor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,1)"/>
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${W}" height="${H}" fill="url(#bg)"/>

      <!-- Spotlight glow -->
      <rect width="${W}" height="${H}" fill="url(#spotlight)"/>

      <!-- Top credit line — fixed font, will not wrap -->
      <text
        x="${W / 2}"
        y="34"
        font-family="Arial, Helvetica, sans-serif"
        font-size="14"
        font-weight="600"
        fill="rgba(255,255,255,0.65)"
        text-anchor="middle"
        letter-spacing="3"
      >A FILM BY T. RATIST</text>

      <!-- Sun dot (the spotlight "source") -->
      <circle cx="${W / 2}" cy="135" r="6" fill="#fde68a"/>

      <!-- Mountain silhouette -->
      <polygon points="0,420 72,260 130,360 210,200 280,310 350,220 ${W},420" fill="rgba(0,0,0,0.75)"/>

      <!-- Foreground floor gradient -->
      <rect x="0" y="420" width="${W}" height="${H - 420}" fill="url(#floor)"/>

      <!-- Title — stacked -->
      <text x="${W / 2}" y="450" font-family="Arial Black, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">THE</text>
      <text x="${W / 2}" y="494" font-family="Arial Black, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">PREDICTED</text>
      <text x="${W / 2}" y="538" font-family="Arial Black, Arial, sans-serif" font-size="40" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">ONE</text>

      <!-- Year (Roman numerals) — proper poster flex -->
      <text
        x="${W / 2}"
        y="580"
        font-family="Arial, Helvetica, sans-serif"
        font-size="13"
        font-weight="600"
        fill="rgba(255,255,255,0.55)"
        text-anchor="middle"
        letter-spacing="4"
      >MMXXIV</text>
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(OUT);
  console.log("Wrote " + OUT + " (" + W + "x" + H + ")");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
