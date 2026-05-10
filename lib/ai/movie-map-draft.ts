import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";

// The five visual archetypes the renderer supports. Picking the right one is
// the most important decision the model makes — each has a distinct layout
// that changes what the map communicates.
export const MAP_TYPES = ["timeline", "nested_layers", "tree", "web", "sequence"] as const;
export type MapType = (typeof MAP_TYPES)[number];

export const EDGE_KINDS = ["causal", "parallel", "flashback", "connection", "reveal", "transform"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface MovieMapNode {
  id: string;
  label: string;
  group?: string | null;
  timelineMarker?: string | null;
  notes?: string | null;
}

export interface MovieMapEdge {
  from: string;
  to: string;
  kind?: EdgeKind | null;
  label?: string | null;
}

export interface MovieMapDraft {
  mapType: MapType;
  title: string;
  summary: string;
  legend: Array<{ label: string; color: string }>;
  lanes: string[];
  nodes: MovieMapNode[];
  edges: MovieMapEdge[];
}

export interface MovieMapInput {
  prompt?: string;
  movies?: Array<{ title: string; mediaType: "movie" | "tv"; year?: number | null }>;
}

function buildSystemPrompt(): string {
  return `You are helping an admin draft the visual structure of a "movie map" — a schematic diagram that makes a complex or non-linear movie plot easier to follow.

The output you produce is NOT the final artwork. It is a first-draft skeleton that the admin will redraw in Photoshop. Prioritise clarity and correctness over decoration. Terse labels are better than long ones.

### Pick exactly one mapType

Choose the archetype that best matches the story's structure. Don't hedge.

- "timeline": parallel or reordered chronology. Nodes have a clear order along a horizontal time axis, optionally split across multiple named lanes. Use for: Memento (reverse vs forward lanes), Dunkirk (Mole/Sea/Air), Cloud Atlas chronological untangling, any film with parallel intercut storylines.
- "nested_layers": concentric levels of reality or abstraction. Use for: Inception (reality → L1 → L2 → L3 → limbo), The Matrix (Zion → Matrix → Machine), any "story within a story" or nested-dream structure.
- "tree": branching causality or hierarchy. Root at top, children fanning below. Use for: Primer / The Butterfly Effect (timeline splits), Clue-style "what if" branches, character family trees, influence maps where one event spawns many.
- "web": ensemble connections with no clear hierarchy or time order. Nodes arranged in a ring, edges showing who affects whom. Use for: Magnolia, Crash, Babel, Love Actually — thematic webs and character interconnection.
- "sequence": a single narrative line where the plot is told OUT of chronological order and the map's job is to show the "real" order. Nodes laid out in narrative order left-to-right; arrows show chronological order. Use for: Pulp Fiction (reordered chapters), Arrival (Louise's future/past), 500 Days of Summer (non-linear dating).

If two fit, pick the one that better shows what's confusing about the film. "Memento" is a timeline (two lanes) not a sequence — the lanes are the point. "Inception" is nested_layers, NOT a tree, because the levels are what matter.

### Nodes

- 6-20 nodes. Fewer is often better — a map with 8 strong nodes beats one with 20 noisy ones.
- "label" is the headline, 1-5 words. Example: "Ariadne enters dream", "Memento — reverse path opens", "Vincent dies". Do NOT write full sentences.
- "group" assigns the node to a named bucket used for color-coding. For "timeline" and "nested_layers", the group name MUST match one of the lane/layer names you declare in "lanes". For "web" and "tree", groups are optional (character names, themes). For "sequence", groups can mark acts or narrators.
- "timelineMarker" is a short time/position label rendered near the node. Use "Day 1", "Level 2", "-3 min", "Act II", "2019", "Ch. 3". Leave null if no clear marker applies.
- "notes" is an internal one-sentence note for the admin — context they might want to reference when drawing the final map. KEEP UNDER ~100 CHARACTERS. Do NOT restate the label. Examples: "First scene chronologically but last scene shown", "Where the dream collapses begin". Leave null when unneeded — short is better than verbose.

Every node MUST have a unique "id" — use short kebab-case slugs like "memento-open" or "dream-l3".

### Edges

- Connect related nodes. Don't over-connect. Skip obvious neighbouring timeline links unless they carry meaning.
- "kind" hints at the relationship. The renderer styles each differently:
  - "causal" (default) — standard plot cause-and-effect arrow.
  - "parallel" — events happening simultaneously in different lanes. Use on timelines for the "meanwhile" connection.
  - "flashback" — backward-in-time jump. Curved dashed arrow.
  - "connection" — thematic/character link without causation. Used in "web" maps.
  - "reveal" — a later scene that reframes an earlier one. Use sparingly.
  - "transform" — a character arc or physical transformation between two states.
- "label" is a 1-3 word edge caption. Example: "remembers", "awakens", "kills", "20 years later". Leave null unless the arrow needs explaining.

### Lanes (for timeline + nested_layers + sequence)

- "timeline": "lanes" is the list of track names TOP TO BOTTOM. Example for Memento: ["Color — forward", "Black & white — reverse"]. For Dunkirk: ["Air — 1 hour", "Sea — 1 day", "Mole — 1 week"]. For Tenet: ["Forward time", "Inverted time"].
- "nested_layers": "lanes" is the list of layers OUTER TO INNER. Example for Inception: ["Reality", "L1 — Van", "L2 — Hotel", "L3 — Fortress", "Limbo"].
- "sequence": optional. Use "lanes" only if the nodes split into acts/narrators. Otherwise leave empty.
- "tree" and "web": leave "lanes" as an empty array.

**CRITICAL:** for timeline and nested_layers, if your nodes use distinct "group" values, those group names MUST ALSO appear in "lanes" (in the order you want them rendered top-to-bottom / outer-to-inner). A node with group="X" where "X" is not in "lanes" is a BUG — the renderer will collapse all such nodes into a single overcrowded row. Rule of thumb: every distinct group used by nodes → add it to lanes.

### Legend

"legend" is 1-6 entries pairing a group/lane label with a color. Colors are HEX strings, e.g. "#e53e3e". Pick distinct, high-contrast colors — the renderer will fall back to a palette if you leave legend empty, but a curated legend reads better. The legend labels MUST match the lane/group names you use elsewhere.

### Title and summary

"title" is the movie map's working title. 3-8 words. "Inception — The Five Levels" or "Pulp Fiction — In Order".

"summary" is a one-paragraph plot overview (2-4 sentences, ≤300 chars) the admin can reference while redrawing. Do NOT restate the map — describe the film's actual plot briefly so the admin has context in one place.

### Quality bar

- No spoiler avoidance — the admin wants the full plot mapped.
- No filler nodes. Every node earns its spot.
- Never output raw <svg> or HTML. Only the structured tool call.
- Never output a map for a film you don't know well enough. If unsure, still emit a reasonable structure and flag uncertainty in the node "notes" or the "summary".`;
}

let cachedSystemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = buildSystemPrompt();
  return cachedSystemPrompt;
}

const DRAFT_TOOL: Anthropic.Tool = {
  name: "draft_movie_map",
  description: "Produce a structured first-draft movie map for the admin. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      mapType: { type: "string", enum: [...MAP_TYPES], description: "The visual archetype that best matches this plot." },
      title: { type: "string", description: "Working title for the map. 3-8 words." },
      summary: { type: "string", description: "One-paragraph plot overview (<=300 chars)." },
      legend: {
        type: "array",
        description: "Color key. 0-6 entries. Each label should match a lane or group name used in nodes.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            color: { type: "string", description: "Hex color like #e53e3e." },
          },
          required: ["label", "color"],
          additionalProperties: false,
        },
      },
      lanes: {
        type: "array",
        items: { type: "string" },
        description: "Ordered lane/layer names. Top-to-bottom for timeline, outer-to-inner for nested_layers, empty for tree/web.",
      },
      nodes: {
        type: "array",
        description: "6-20 plot beats.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique kebab-case slug." },
            label: { type: "string", description: "1-5 word headline." },
            group: { type: ["string", "null"], description: "Lane/group name this node belongs to. Null if ungrouped." },
            timelineMarker: { type: ["string", "null"], description: "Short time/position label or null." },
            notes: { type: ["string", "null"], description: "One-sentence internal note or null." },
          },
          required: ["id", "label", "group", "timelineMarker", "notes"],
          additionalProperties: false,
        },
      },
      edges: {
        type: "array",
        description: "Meaningful connections. Skip trivial neighbouring links.",
        items: {
          type: "object",
          properties: {
            from: { type: "string", description: "Source node id." },
            to: { type: "string", description: "Target node id." },
            kind: { type: ["string", "null"], enum: [...EDGE_KINDS, null], description: "Relationship kind or null (defaults to causal)." },
            label: { type: ["string", "null"], description: "1-3 word caption or null." },
          },
          required: ["from", "to", "kind", "label"],
          additionalProperties: false,
        },
      },
    },
    required: ["mapType", "title", "summary", "legend", "lanes", "nodes", "edges"],
    additionalProperties: false,
  },
};

function buildUserMessage(input: MovieMapInput): string {
  const parts: string[] = [];
  if (input.movies && input.movies.length > 0) {
    const list = input.movies
      .map((m) => {
        const yr = m.year ? ` (${m.year})` : "";
        const kind = m.mediaType === "tv" ? " [TV series]" : "";
        return `- ${m.title}${yr}${kind}`;
      })
      .join("\n");
    parts.push(`Film(s) to map:\n${list}`);
  }
  if (input.prompt && input.prompt.trim().length > 0) {
    parts.push(`Admin guidance: ${input.prompt.trim()}`);
  }
  if (parts.length === 0) {
    throw new Error("Need at least a movie or a prompt");
  }
  return parts.join("\n\n");
}

export async function draftMovieMap(input: MovieMapInput): Promise<MovieMapDraft> {
  const client = getAnthropic();
  const userMessage = buildUserMessage(input);
  const response = await client.messages.create({
    // Sonnet 4.6 over Haiku — Haiku consistently produced overlapping
    // layouts and chose wrong archetypes (e.g., timeline for Inception
    // when nested_layers is the right shape). The marginal cost is
    // worth it for an admin-only drafting tool that gets human-reviewed
    // before publication anyway.
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: getSystemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_movie_map" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a structured movie map");
  }
  return normalizeDraft(toolUse.input);
}

function normalizeDraft(raw: unknown): MovieMapDraft {
  const input = (raw ?? {}) as Partial<MovieMapDraft>;
  const mapType: MapType = (MAP_TYPES as readonly string[]).includes(input.mapType as string)
    ? (input.mapType as MapType)
    : "timeline";

  const nodes: MovieMapNode[] = Array.isArray(input.nodes)
    ? input.nodes
        .filter((n): n is MovieMapNode => typeof n === "object" && n !== null && typeof (n as MovieMapNode).id === "string" && typeof (n as MovieMapNode).label === "string")
        .slice(0, 30)
        .map((n) => ({
          id: String(n.id).slice(0, 60),
          label: String(n.label).slice(0, 80),
          group: typeof n.group === "string" && n.group.length > 0 ? n.group.slice(0, 60) : null,
          timelineMarker: typeof n.timelineMarker === "string" && n.timelineMarker.length > 0 ? n.timelineMarker.slice(0, 40) : null,
          notes: typeof n.notes === "string" && n.notes.length > 0 ? n.notes.slice(0, 240) : null,
        }))
    : [];

  const validIds = new Set(nodes.map((n) => n.id));
  const edges: MovieMapEdge[] = Array.isArray(input.edges)
    ? input.edges
        .filter((e): e is MovieMapEdge => typeof e === "object" && e !== null)
        .map((e) => ({
          from: typeof e.from === "string" ? e.from : "",
          to: typeof e.to === "string" ? e.to : "",
          kind: typeof e.kind === "string" && (EDGE_KINDS as readonly string[]).includes(e.kind) ? (e.kind as EdgeKind) : null,
          label: typeof e.label === "string" && e.label.length > 0 ? e.label.slice(0, 40) : null,
        }))
        .filter((e) => validIds.has(e.from) && validIds.has(e.to))
    : [];

  const legend = Array.isArray(input.legend)
    ? input.legend
        .filter((l): l is { label: string; color: string } => typeof l === "object" && l !== null && typeof (l as { label?: string }).label === "string" && typeof (l as { color?: string }).color === "string")
        .slice(0, 8)
        .map((l) => ({
          label: l.label.slice(0, 60),
          color: /^#[0-9a-fA-F]{3,8}$/.test(l.color) ? l.color : "#e53e3e",
        }))
    : [];

  let lanes = Array.isArray(input.lanes)
    ? input.lanes.filter((l): l is string => typeof l === "string" && l.length > 0).slice(0, 10).map((l) => l.slice(0, 80))
    : [];

  // Auto-promote groups to lanes for layouts that render nodes by lane. If the
  // model emitted node.group values but no lanes (or lanes that don't cover
  // those groups), treat the distinct groups as implicit lanes — otherwise all
  // nodes collapse into a single row and overlap.
  if ((mapType === "timeline" || mapType === "nested_layers") && lanes.length === 0) {
    const groups = Array.from(new Set(nodes.map((n) => n.group).filter((g): g is string => !!g)));
    if (groups.length > 0) lanes = groups.slice(0, 10);
  }

  return {
    mapType,
    title: typeof input.title === "string" && input.title.length > 0 ? input.title.slice(0, 120) : "Movie Map",
    summary: typeof input.summary === "string" ? input.summary.slice(0, 600) : "",
    legend,
    lanes,
    nodes,
    edges,
  };
}
