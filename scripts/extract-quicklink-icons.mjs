// Reads the lucide-react source for each Quick Links widget icon and
// emits Android vector drawable XML alongside an SVG (the SVG also
// serves as the iOS source — drop into Assets.xcassets).
//
// Run once with:
//   node scripts/extract-quicklink-icons.mjs
//
// Output:
//   mobile/android/app/src/main/res/drawable/quicklink_<name>.xml
//   mobile/quicklink-icons-ios/quicklink_<name>.svg
//
// The Android drawables are stroke-only (matches lucide's default
// presentation). Tinted at runtime via android:tint or
// ImageView#setColorFilter so the widget can match the user's
// theme.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");

const LUCIDE_DIR = path.join(WEB_ROOT, "node_modules", "lucide-react", "dist", "esm", "icons");
const ANDROID_DRAWABLE = path.join(REPO_ROOT, "mobile", "android", "app", "src", "main", "res", "drawable");
const IOS_OUTPUT = path.join(REPO_ROOT, "mobile", "quicklink-icons-ios");

// (lucide source filename, Android resource suffix). The Lucide
// source uses kebab-case; Android resource names use snake_case.
const ICONS = [
  ["bookmark", "bookmark"],
  ["list-ordered", "list_ordered"],  // Rankings (was bar-chart-3)
  ["star", "star"],
  ["layers", "layers"],
  ["monitor-play", "monitor_play"],
  ["sparkles", "sparkles"],
  ["users", "users"],
  ["user-circle", "user_circle"],
  ["heart", "heart"],
  ["message-square", "message_square"],
  ["newspaper", "newspaper"],
  ["film", "film"],
  ["brain", "brain"],            // Cine-Q (was help-circle)
  ["user-search", "user_search"],
  ["user-star", "user_star"],    // Celebrities (was theater)
  ["eye", "eye"],                // Diary (was book-open)
  ["wrench", "wrench"],
];

// Parse the __iconNode array from a lucide-react icon module. The
// file exports a static array like:
//   const __iconNode = [
//     ["circle", { cx: "10", cy: "7", r: "4", key: "..." }],
//     ["path",   { d: "M10.3 15H7a4 4 0 0 0-4 4v2", key: "..." }],
//     ...
//   ];
// We pull the array out with a regex + JSON.parse-ish massage rather
// than running the JS — keeps the script side-effect-free.
async function loadIconSource(lucideName, depth = 0) {
  if (depth > 5) throw new Error("Re-export chain too deep");
  const src = path.join(LUCIDE_DIR, `${lucideName}.js`);
  const source = await fs.readFile(src, "utf8");
  // Lucide v1 renamed icons (bar-chart-3 → chart-column,
  // help-circle → circle-help, etc.). The old names ship as
  // tiny shim modules that re-export the renamed file:
  //   export { default } from './chart-column.js';
  // Follow that pointer so the caller doesn't need to know.
  const reExport = source.match(/export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([\w-]+)\.js['"]/);
  if (reExport) {
    return loadIconSource(reExport[1], depth + 1);
  }
  return source;
}

function parseIconNode(source) {
  const match = source.match(/const __iconNode\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Couldn't find __iconNode block");
  // Convert JS object literal to JSON: quote keys, drop trailing commas.
  let js = match[1]
    .replace(/(\w+):/g, '"$1":')        // bare keys → JSON keys
    .replace(/,\s*([}\]])/g, "$1");     // trailing commas
  return JSON.parse(js);
}

// Convert a lucide primitive into one or more `<path>` entries in
// Android vector drawable syntax. Lucide icons are all stroked, not
// filled, so we set strokeWidth and skip fillColor.
function primitiveToPathData(prim) {
  const [kind, attrs] = prim;
  switch (kind) {
    case "path":
      return attrs.d;
    case "line":
      return `M${attrs.x1},${attrs.y1} L${attrs.x2},${attrs.y2}`;
    case "circle": {
      const cx = Number(attrs.cx);
      const cy = Number(attrs.cy);
      const r = Number(attrs.r);
      // Two arcs forming a full circle (SVG arc can't span 360°).
      return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;
    }
    case "ellipse": {
      const cx = Number(attrs.cx);
      const cy = Number(attrs.cy);
      const rx = Number(attrs.rx);
      const ry = Number(attrs.ry);
      return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
    }
    case "rect": {
      const x = Number(attrs.x);
      const y = Number(attrs.y);
      const w = Number(attrs.width);
      const h = Number(attrs.height);
      const rx = Number(attrs.rx ?? 0);
      const ry = Number(attrs.ry ?? rx);
      if (rx === 0 && ry === 0) {
        return `M${x},${y} h${w} v${h} h${-w} z`;
      }
      // Rounded rect path (clockwise from top-left, after the corner)
      return [
        `M${x + rx},${y}`,
        `h${w - 2 * rx}`,
        `a${rx},${ry} 0 0 1 ${rx},${ry}`,
        `v${h - 2 * ry}`,
        `a${rx},${ry} 0 0 1 ${-rx},${ry}`,
        `h${-(w - 2 * rx)}`,
        `a${rx},${ry} 0 0 1 ${-rx},${-ry}`,
        `v${-(h - 2 * ry)}`,
        `a${rx},${ry} 0 0 1 ${rx},${-ry}`,
        "z",
      ].join(" ");
    }
    case "polyline":
    case "polygon": {
      const pts = String(attrs.points).trim().split(/[ ,]+/).map(Number);
      let d = `M${pts[0]},${pts[1]}`;
      for (let i = 2; i < pts.length; i += 2) {
        d += ` L${pts[i]},${pts[i + 1]}`;
      }
      if (kind === "polygon") d += " Z";
      return d;
    }
    default:
      throw new Error(`Unhandled lucide primitive: ${kind}`);
  }
}

function toAndroidXml(nodes) {
  const paths = nodes
    .map(primitiveToPathData)
    .map(
      (d) =>
        `    <path\n` +
        `        android:strokeColor="#FFFFFFFF"\n` +
        `        android:strokeWidth="2"\n` +
        `        android:strokeLineCap="round"\n` +
        `        android:strokeLineJoin="round"\n` +
        `        android:pathData="${d}" />`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!-- Generated from lucide-react. Do not edit by hand; rerun\n` +
    `     scripts/extract-quicklink-icons.mjs from web/ instead. -->\n` +
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n` +
    `    android:width="24dp"\n` +
    `    android:height="24dp"\n` +
    `    android:viewportWidth="24"\n` +
    `    android:viewportHeight="24">\n` +
    `${paths}\n` +
    `</vector>\n`
  );
}

function toSvg(nodes) {
  const inner = nodes
    .map((prim) => {
      const [kind, attrs] = prim;
      const cleaned = { ...attrs };
      delete cleaned.key;
      const attrStr = Object.entries(cleaned)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `  <${kind} ${attrStr}/>`;
    })
    .join("\n");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n` +
    `${inner}\n` +
    `</svg>\n`
  );
}

async function main() {
  await fs.mkdir(IOS_OUTPUT, { recursive: true });

  for (const [lucideName, androidName] of ICONS) {
    let source;
    try {
      source = await loadIconSource(lucideName);
    } catch (e) {
      console.error(`Skip ${lucideName} — ${e.message}`);
      continue;
    }
    const nodes = parseIconNode(source);
    const androidXml = toAndroidXml(nodes);
    const svg = toSvg(nodes);

    const androidPath = path.join(ANDROID_DRAWABLE, `quicklink_${androidName}.xml`);
    const iosPath = path.join(IOS_OUTPUT, `quicklink_${androidName}.svg`);

    await fs.writeFile(androidPath, androidXml, "utf8");
    await fs.writeFile(iosPath, svg, "utf8");
    console.log(`✓ ${lucideName} → ${androidName}`);
  }
  console.log("\nAndroid drawables:  ", ANDROID_DRAWABLE);
  console.log("iOS SVG sources:    ", IOS_OUTPUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
