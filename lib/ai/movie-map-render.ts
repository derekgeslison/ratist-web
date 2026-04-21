import type { MovieMapDraft, MovieMapNode, MovieMapEdge } from "./movie-map-draft";

const MIN_W = 1400;
const H = 900;
const TITLE_H = 70;
const LEGEND_H = 60;
const PAD = 60;
const NODE_W = 160;
const NODE_H = 60;
const NODE_GAP = 30; // minimum gap between adjacent node rectangles

const PALETTE = ["#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5", "#dd6b20", "#319795", "#d53f8c"];
const BG = "#0b0b0f";
const FG = "#f4f4f5";
const MUTED = "#a1a1aa";
const GRID = "#27272a";

export function renderMovieMapSvg(draft: MovieMapDraft): string {
  const groupColors = assignGroupColors(draft);
  const W = computeCanvasWidth(draft);

  const body = (() => {
    switch (draft.mapType) {
      case "nested_layers": return layoutNestedLayers(draft, groupColors, W);
      case "tree": return layoutTree(draft, groupColors, W);
      case "web": return layoutWeb(draft, groupColors, W);
      case "sequence": return layoutSequence(draft, groupColors, W);
      case "timeline":
      default: return layoutTimeline(draft, groupColors, W);
    }
  })();

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
    defsBlock(),
    `<rect width="${W}" height="${H}" fill="${BG}"/>`,
    renderTitle(draft, W),
    `<g id="map-body">`,
    body,
    `</g>`,
    renderLegend(draft, groupColors, W),
    `</svg>`,
  ].join("\n");
}

function computeCanvasWidth(draft: MovieMapDraft): number {
  // Work out the densest horizontal row. Each node needs NODE_W + NODE_GAP
  // of horizontal budget. Canvas width = max(MIN_W, densest * step + 2*PAD).
  let densest = 1;
  switch (draft.mapType) {
    case "timeline": {
      const lanes = draft.lanes.length > 0 ? draft.lanes : ["Main"];
      const ungrouped = draft.nodes.filter((n) => !n.group || !lanes.includes(n.group)).length;
      lanes.forEach((lane, li) => {
        const inLane = draft.nodes.filter((n) => (n.group ?? lanes[0]) === lane).length;
        // Ungrouped nodes all fall into the first lane in the layout.
        const withFallback = inLane + (li === 0 ? ungrouped : 0);
        if (withFallback > densest) densest = withFallback;
      });
      break;
    }
    case "sequence":
      densest = draft.nodes.length;
      break;
    case "nested_layers": {
      const layers = draft.lanes.length > 0
        ? draft.lanes
        : Array.from(new Set(draft.nodes.map((n) => n.group).filter((g): g is string => !!g)));
      for (let li = 0; li < layers.length; li++) {
        const inLayer = draft.nodes.filter((n) => n.group === layers[li]).length;
        // Non-innermost layers split into top + bottom bands, so densest side is ceil(n/2).
        const perBand = li === layers.length - 1 ? Math.ceil(Math.sqrt(inLayer)) : Math.ceil(inLayer / 2);
        if (perBand > densest) densest = perBand;
      }
      break;
    }
    case "tree": {
      const incoming = new Map<string, number>();
      for (const n of draft.nodes) incoming.set(n.id, 0);
      for (const e of draft.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
      const roots = draft.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
      const effectiveRoots = roots.length > 0 ? roots : [draft.nodes[0]].filter(Boolean);
      const level = new Map<string, number>();
      const queue: Array<{ id: string; d: number }> = effectiveRoots.map((n) => ({ id: n.id, d: 0 }));
      const seen = new Set<string>();
      while (queue.length) {
        const { id, d } = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        level.set(id, d);
        for (const e of draft.edges) if (e.from === id && !seen.has(e.to)) queue.push({ id: e.to, d: d + 1 });
      }
      for (const n of draft.nodes) if (!level.has(n.id)) level.set(n.id, -1);
      const counts = new Map<number, number>();
      for (const d of level.values()) counts.set(d, (counts.get(d) ?? 0) + 1);
      densest = Math.max(1, ...counts.values());
      break;
    }
    case "web":
      // radial layout — no horizontal density pressure, keep default width.
      densest = 1;
      break;
  }
  const required = densest * (NODE_W + NODE_GAP) + PAD * 2;
  return Math.max(MIN_W, required);
}

function defsBlock(): string {
  const arrowheads = ["causal", "parallel", "flashback", "connection", "reveal", "transform", "default"]
    .map((k) => {
      const color = edgeColor(k === "default" ? null : (k as never));
      return `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
    })
    .join("");
  return `<defs>${arrowheads}</defs>`;
}

function renderTitle(draft: MovieMapDraft, W: number): string {
  // Title: truncate rather than wrap — two-line titles push the summary down
  // into the map body. ~15px per char at 26px font.
  const titleMaxChars = Math.max(20, Math.floor((W - PAD * 2) / 15));
  const title = escapeXml(truncate(draft.title, titleMaxChars));
  const summaryMaxChars = Math.max(40, Math.floor((W - PAD * 2) / 7));
  const summaryLines = draft.summary ? wrapLabel(draft.summary, summaryMaxChars, 2) : [];
  const summaryTspans = summaryLines
    .map((ln, i) => `<tspan x="${PAD}" dy="${i === 0 ? 0 : 16}">${escapeXml(ln)}</tspan>`)
    .join("");
  return `<g id="title">
    <text x="${PAD}" y="40" fill="${FG}" font-size="26" font-weight="700">${title}</text>
    ${summaryTspans ? `<text x="${PAD}" y="62" fill="${MUTED}" font-size="13">${summaryTspans}</text>` : ""}
  </g>`;
}

function renderLegend(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  const entries: Array<{ label: string; color: string }> = draft.legend.length > 0
    ? draft.legend
    : Array.from(colors.entries()).slice(0, 6).map(([label, color]) => ({ label, color }));
  if (entries.length === 0) return "";
  const y = H - 32;
  const itemW = Math.min(200, Math.floor((W - PAD * 2) / entries.length));
  const parts = entries.map((e, i) => {
    const x = PAD + i * itemW;
    return `<g><rect x="${x}" y="${y - 10}" width="14" height="14" rx="3" fill="${e.color}"/><text x="${x + 22}" y="${y}" fill="${FG}" font-size="12">${escapeXml(truncate(e.label, 28))}</text></g>`;
  }).join("");
  return `<g id="legend">${parts}</g>`;
}

function assignGroupColors(draft: MovieMapDraft): Map<string, string> {
  const colors = new Map<string, string>();
  for (const entry of draft.legend) colors.set(entry.label, entry.color);
  const groupsFromNodes = Array.from(new Set(draft.nodes.map((n) => n.group).filter((g): g is string => typeof g === "string")));
  const lanes = draft.lanes;
  const allGroups = Array.from(new Set([...lanes, ...groupsFromNodes]));
  let palIdx = 0;
  for (const g of allGroups) {
    if (!colors.has(g)) {
      colors.set(g, PALETTE[palIdx % PALETTE.length]);
      palIdx++;
    }
  }
  return colors;
}

function colorFor(node: MovieMapNode, colors: Map<string, string>): string {
  if (node.group && colors.has(node.group)) return colors.get(node.group)!;
  return PALETTE[0];
}

function edgeColor(kind: string | null): string {
  switch (kind) {
    case "causal": return "#a1a1aa";
    case "parallel": return "#3182ce";
    case "flashback": return "#805ad5";
    case "connection": return "#38a169";
    case "reveal": return "#d69e2e";
    case "transform": return "#e53e3e";
    default: return "#a1a1aa";
  }
}

function edgeDash(kind: string | null): string {
  switch (kind) {
    case "flashback": return "6 4";
    case "parallel": return "2 3";
    case "connection": return "1 3";
    default: return "";
  }
}

// ───────── layouts ─────────

function layoutTimeline(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  const lanes = draft.lanes.length > 0 ? draft.lanes : ["Main"];
  const top = TITLE_H + 20;
  const bottom = H - LEGEND_H - 20;
  const laneH = (bottom - top) / lanes.length;
  const positions = new Map<string, { x: number; y: number }>();
  const laneElements: string[] = [];

  lanes.forEach((lane, li) => {
    const ly = top + laneH * li + laneH / 2;
    const nodesInLane = draft.nodes.filter((n) => (n.group ?? lanes[0]) === lane);
    const fallback = li === 0 ? draft.nodes.filter((n) => !n.group || !lanes.includes(n.group)) : [];
    const combined = [...nodesInLane, ...fallback];

    // lane label + guide line
    laneElements.push(
      `<g class="lane" data-lane="${escapeXml(lane)}">`,
      `<text x="${PAD}" y="${ly - laneH / 2 + 18}" fill="${MUTED}" font-size="11" font-weight="600" letter-spacing="1">${escapeXml(lane.toUpperCase())}</text>`,
      `<line x1="${PAD}" y1="${ly}" x2="${W - PAD}" y2="${ly}" stroke="${GRID}" stroke-width="1"/>`,
    );

    const n = combined.length;
    if (n > 0) {
      const leftX = PAD + NODE_W / 2;
      const rightX = W - PAD - NODE_W / 2;
      const step = n > 1 ? (rightX - leftX) / (n - 1) : 0;
      combined.forEach((node, i) => {
        const x = n === 1 ? (leftX + rightX) / 2 : leftX + i * step;
        positions.set(node.id, { x, y: ly });
      });
    }
    laneElements.push(`</g>`);
  });

  return [
    `<g id="lanes">${laneElements.join("")}</g>`,
    renderEdgePaths(draft.edges, positions),
    renderNodes(draft.nodes, positions, colors),
    renderEdgeLabels(draft.edges, positions),
  ].join("");
}

function layoutSequence(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  const y = (TITLE_H + H - LEGEND_H) / 2;
  const n = draft.nodes.length;
  const positions = new Map<string, { x: number; y: number }>();
  const leftX = PAD + NODE_W / 2;
  const rightX = W - PAD - NODE_W / 2;
  const step = n > 1 ? (rightX - leftX) / (n - 1) : 0;
  draft.nodes.forEach((node, i) => {
    positions.set(node.id, { x: n === 1 ? (leftX + rightX) / 2 : leftX + i * step, y });
  });

  // narrative-order underline
  const underline = n > 1
    ? `<line x1="${leftX}" y1="${y + NODE_H / 2 + 30}" x2="${rightX}" y2="${y + NODE_H / 2 + 30}" stroke="${GRID}" stroke-width="1" stroke-dasharray="2 3"/><text x="${PAD}" y="${y + NODE_H / 2 + 55}" fill="${MUTED}" font-size="11" font-weight="600" letter-spacing="1">NARRATIVE ORDER →</text>`
    : "";

  return [
    `<g id="narrative-line">${underline}</g>`,
    renderEdgePaths(draft.edges, positions),
    renderNodes(draft.nodes, positions, colors),
    renderEdgeLabels(draft.edges, positions),
  ].join("");
}

function layoutNestedLayers(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  const layers = draft.lanes.length > 0
    ? draft.lanes
    : Array.from(new Set(draft.nodes.map((n) => n.group).filter((g): g is string => !!g)));
  if (layers.length === 0) return layoutTimeline(draft, colors, W);

  const cx = W / 2;
  const cy = (TITLE_H + H - LEGEND_H) / 2;
  const maxW = W - PAD * 2;
  const maxH = H - TITLE_H - LEGEND_H - 60;
  const outerW = Math.min(maxW, 1200);
  const outerH = Math.min(maxH, 700);
  const shrinkW = outerW / layers.length;
  const shrinkH = outerH / layers.length;
  const positions = new Map<string, { x: number; y: number }>();
  const layerRects: string[] = [];

  layers.forEach((layer, li) => {
    const rw = outerW - li * shrinkW;
    const rh = outerH - li * shrinkH;
    const rx = cx - rw / 2;
    const ry = cy - rh / 2;
    const color = colors.get(layer) ?? PALETTE[li % PALETTE.length];
    layerRects.push(
      `<g class="layer" data-layer="${escapeXml(layer)}">`,
      `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="16" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/>`,
      `<text x="${rx + 14}" y="${ry + 22}" fill="${color}" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(layer.toUpperCase())}</text>`,
      `</g>`,
    );

    // Place nodes for this layer inside its ring band (between this ring and
    // the next inner ring). Outer rings get a top row + a bottom row along the
    // band; innermost ring gets a centred grid.
    const nodesInLayer = draft.nodes.filter((n) => n.group === layer);
    if (nodesInLayer.length > 0) {
      const isInnermost = li === layers.length - 1;
      if (isInnermost) {
        const cols = Math.ceil(Math.sqrt(nodesInLayer.length));
        const cellW = (rw - 40) / cols;
        const rows = Math.ceil(nodesInLayer.length / cols);
        const cellH = (rh - 60) / rows;
        nodesInLayer.forEach((node, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = rx + 20 + cellW * (col + 0.5);
          const y = ry + 40 + cellH * (row + 0.5);
          positions.set(node.id, { x, y });
        });
      } else {
        const innerRy = cy - (outerH - (li + 1) * shrinkH) / 2;
        const innerRh = outerH - (li + 1) * shrinkH;
        const topBandMid = (ry + innerRy) / 2 + 4;
        const bottomBandMid = (innerRy + innerRh + ry + rh) / 2 - 4;
        const half = Math.ceil(nodesInLayer.length / 2);
        const spanStart = rx + NODE_W / 2 + 10;
        const spanEnd = rx + rw - NODE_W / 2 - 10;
        nodesInLayer.forEach((node, i) => {
          const onTop = i < half;
          const count = onTop ? half : nodesInLayer.length - half;
          const idx = onTop ? i : i - half;
          const step = count > 1 ? (spanEnd - spanStart) / (count - 1) : 0;
          const x = count === 1 ? (spanStart + spanEnd) / 2 : spanStart + idx * step;
          positions.set(node.id, { x, y: onTop ? topBandMid : bottomBandMid });
        });
      }
    }
  });

  // Ungrouped nodes → centre
  const ungrouped = draft.nodes.filter((n) => !n.group || !layers.includes(n.group));
  if (ungrouped.length > 0) {
    ungrouped.forEach((node, i) => {
      positions.set(node.id, { x: cx + (i - ungrouped.length / 2) * (NODE_W + 10) + NODE_W / 2, y: cy });
    });
  }

  return [
    `<g id="layers">${layerRects.join("")}</g>`,
    renderEdgePaths(draft.edges, positions),
    renderNodes(draft.nodes, positions, colors),
    renderEdgeLabels(draft.edges, positions),
  ].join("");
}

function layoutTree(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  // BFS from nodes with no incoming edge.
  const incoming = new Map<string, number>();
  for (const n of draft.nodes) incoming.set(n.id, 0);
  for (const e of draft.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const roots = draft.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const effectiveRoots = roots.length > 0 ? roots : [draft.nodes[0]].filter(Boolean);

  const level = new Map<string, number>();
  const queue: Array<{ id: string; d: number }> = effectiveRoots.map((n) => ({ id: n.id, d: 0 }));
  const seen = new Set<string>();
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    level.set(id, d);
    for (const e of draft.edges) {
      if (e.from === id && !seen.has(e.to)) queue.push({ id: e.to, d: d + 1 });
    }
  }
  // Orphans get max depth + 1
  const maxD = Math.max(0, ...Array.from(level.values()));
  for (const n of draft.nodes) if (!level.has(n.id)) level.set(n.id, maxD + 1);

  const depths = Math.max(1, Math.max(0, ...Array.from(level.values())) + 1);
  const top = TITLE_H + 30;
  const bottom = H - LEGEND_H - 30;
  const rowH = (bottom - top) / depths;
  const positions = new Map<string, { x: number; y: number }>();

  for (let d = 0; d < depths; d++) {
    const row = draft.nodes.filter((n) => level.get(n.id) === d);
    const n = row.length;
    if (n === 0) continue;
    const leftX = PAD + NODE_W / 2;
    const rightX = W - PAD - NODE_W / 2;
    const step = n > 1 ? (rightX - leftX) / (n - 1) : 0;
    row.forEach((node, i) => {
      const x = n === 1 ? (leftX + rightX) / 2 : leftX + i * step;
      positions.set(node.id, { x, y: top + rowH * d + rowH / 2 });
    });
  }

  return [
    renderEdgePaths(draft.edges, positions),
    renderNodes(draft.nodes, positions, colors),
    renderEdgeLabels(draft.edges, positions),
  ].join("");
}

function layoutWeb(draft: MovieMapDraft, colors: Map<string, string>, W: number): string {
  const cx = W / 2;
  const cy = (TITLE_H + H - LEGEND_H) / 2;
  const radius = Math.min(W / 2 - PAD - NODE_W / 2, (H - TITLE_H - LEGEND_H) / 2 - NODE_H);
  const n = draft.nodes.length;
  const positions = new Map<string, { x: number; y: number }>();
  draft.nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    positions.set(node.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });
  return [
    renderEdgePaths(draft.edges, positions, true),
    renderNodes(draft.nodes, positions, colors),
    renderEdgeLabels(draft.edges, positions, true),
  ].join("");
}

// ───────── shared renderers ─────────

function renderNodes(nodes: MovieMapNode[], positions: Map<string, { x: number; y: number }>, colors: Map<string, string>): string {
  const parts: string[] = ['<g id="nodes">'];
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const color = colorFor(node, colors);
    const x = pos.x - NODE_W / 2;
    const y = pos.y - NODE_H / 2;
    const label = wrapLabel(node.label, 22);
    const lineHeight = 14;
    const totalTextH = label.length * lineHeight;
    const firstLineY = pos.y - totalTextH / 2 + 10;
    const labelLines = label.map((ln, i) => `<tspan x="${pos.x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(ln)}</tspan>`).join("");
    const marker = node.timelineMarker
      ? `<text x="${pos.x}" y="${y - 8}" fill="${MUTED}" font-size="10" text-anchor="middle" letter-spacing="1">${escapeXml(node.timelineMarker.toUpperCase())}</text>`
      : "";
    let note = "";
    if (node.notes) {
      const noteLines = wrapLabel(node.notes, 28, 5);
      const noteLineH = 12;
      note = `<text x="${pos.x}" y="${y + NODE_H + 14}" fill="${MUTED}" font-size="10" text-anchor="middle" font-style="italic">${
        noteLines.map((ln, i) => `<tspan x="${pos.x}" dy="${i === 0 ? 0 : noteLineH}">${escapeXml(ln)}</tspan>`).join("")
      }</text>`;
    }

    parts.push(
      `<g class="node" data-id="${escapeXml(node.id)}">`,
      marker,
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${BG}" stroke="${color}" stroke-width="2"/>`,
      `<rect x="${x}" y="${y}" width="4" height="${NODE_H}" rx="2" fill="${color}"/>`,
      `<text x="${pos.x}" y="${firstLineY}" fill="${FG}" font-size="12" font-weight="600" text-anchor="middle">${labelLines}</text>`,
      note,
      `</g>`,
    );
  }
  parts.push("</g>");
  return parts.join("");
}

// Plan each edge's geometry once so paths and labels stay in sync. Arcs any
// horizontal edge that would otherwise pass THROUGH intermediate nodes, and
// computes a label anchor that sits clear of the node row.
interface EdgePlan {
  sx: number; sy: number; ex: number; ey: number;
  controlX: number; controlY: number; // quadratic Bezier control point
  labelX: number; labelY: number;
  curved: boolean;
}

function planEdges(
  edges: MovieMapEdge[],
  positions: Map<string, { x: number; y: number }>,
  forceCurved: boolean,
): Map<number, EdgePlan> {
  const plans = new Map<number, EdgePlan>();
  const nodeXs = Array.from(positions.values()).map((p) => p.x);
  edges.forEach((edge, idx) => {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    if (!a || !b) return;
    const { sx, sy, ex, ey } = trimToRects(a, b);
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const horizontalSpan = Math.abs(a.x - b.x);
    const verticalSpan = Math.abs(a.y - b.y);
    // Count how many OTHER node centers sit between the endpoints on the
    // horizontal axis while sharing (roughly) the same row. If so, the arrow
    // would cut through them.
    let intermediates = 0;
    if (verticalSpan < NODE_H) {
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      for (const nx of nodeXs) {
        if (nx > minX + NODE_W / 2 && nx < maxX - NODE_W / 2) intermediates++;
      }
    }
    const needsArc = forceCurved || intermediates > 0 || horizontalSpan > NODE_W * 4;
    // Arc amount: bigger for longer arrows and more intermediates, capped.
    const arc = needsArc
      ? Math.min(140, Math.max(40, horizontalSpan / 8 + intermediates * 18))
      : 0;
    // Normal vector (up-ish).
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const controlX = mx + nx * arc;
    const controlY = my + ny * arc;
    // Label sits ON the curve peak (which clears nodes), or offset above
    // straight lines. For near-horizontal straight arrows, push well above
    // the row so labels never land inside a node rect.
    const straightLabelOffset = verticalSpan < NODE_H ? NODE_H / 2 + 16 : 14;
    const labelX = needsArc ? controlX : mx + nx * straightLabelOffset;
    const labelY = needsArc ? controlY : my + ny * straightLabelOffset;
    plans.set(idx, { sx, sy, ex, ey, controlX, controlY, labelX, labelY, curved: needsArc });
  });
  return plans;
}

function renderEdgePaths(
  edges: MovieMapEdge[],
  positions: Map<string, { x: number; y: number }>,
  forceCurved = false,
): string {
  const plans = planEdges(edges, positions, forceCurved);
  const parts: string[] = ['<g id="edges" fill="none">'];
  edges.forEach((edge, idx) => {
    const plan = plans.get(idx);
    if (!plan) return;
    const color = edgeColor(edge.kind ?? null);
    const dash = edgeDash(edge.kind ?? null);
    const markerKind = edge.kind ?? "default";
    const path = plan.curved
      ? `M${plan.sx},${plan.sy} Q${plan.controlX},${plan.controlY} ${plan.ex},${plan.ey}`
      : `M${plan.sx},${plan.sy} L${plan.ex},${plan.ey}`;
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
    parts.push(`<path d="${path}" stroke="${color}" stroke-width="1.6"${dashAttr} marker-end="url(#arrow-${markerKind})"/>`);
  });
  parts.push("</g>");
  return parts.join("");
}

function renderEdgeLabels(
  edges: MovieMapEdge[],
  positions: Map<string, { x: number; y: number }>,
  forceCurved = false,
): string {
  const plans = planEdges(edges, positions, forceCurved);
  const parts: string[] = ['<g id="edge-labels">'];
  edges.forEach((edge, idx) => {
    if (!edge.label) return;
    const plan = plans.get(idx);
    if (!plan) return;
    const color = edgeColor(edge.kind ?? null);
    const labelText = escapeXml(truncate(edge.label, 24));
    const approxW = labelText.length * 5.5 + 10;
    parts.push(
      `<rect x="${plan.labelX - approxW / 2}" y="${plan.labelY - 10}" width="${approxW}" height="14" rx="3" fill="${BG}" stroke="${color}" stroke-width="0.5" opacity="0.95"/>`,
      `<text x="${plan.labelX}" y="${plan.labelY}" fill="${color}" font-size="10" text-anchor="middle" font-style="italic" dominant-baseline="middle">${labelText}</text>`,
    );
  });
  parts.push("</g>");
  return parts.join("");
}

// Trim line endpoints so arrows stop at the node rectangle border, not center.
function trimToRects(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;
  const tA = Math.min(halfW / Math.abs(ux || 0.0001), halfH / Math.abs(uy || 0.0001));
  const tB = tA;
  return {
    sx: a.x + ux * tA,
    sy: a.y + uy * tA,
    ex: b.x - ux * tB,
    ey: b.y - uy * tB,
  };
}

function wrapLabel(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + " " : "") + w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[kept.length - 1] = truncate(kept[kept.length - 1] + "…", maxChars);
    return kept;
  }
  return lines;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
