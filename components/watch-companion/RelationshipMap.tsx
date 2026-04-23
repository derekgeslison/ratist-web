"use client";

import { useMemo, useState } from "react";
import { Heart, Briefcase, Swords, Handshake, GraduationCap, Users, Link2 } from "lucide-react";

interface Character {
  id: string;
  name: string;
  group: string | null;
}

interface Relationship {
  id: string;
  relationshipType: string;
  label: string;
  directed: boolean;
  fromCharacterId: string;
  toCharacterId: string;
}

interface Props {
  characters: Character[];
  relationships: Relationship[];
  groupColors: Map<string, string>;
}

const REL_COLOR: Record<string, string> = {
  romantic: "#ec4899",
  business: "#3b82f6",
  rivalry: "#ef4444",
  alliance: "#22c55e",
  mentor: "#a855f7",
  family: "#f59e0b",
  other: "#9ca3af",
};

const REL_ICONS: Record<string, typeof Heart> = {
  romantic: Heart,
  business: Briefcase,
  rivalry: Swords,
  alliance: Handshake,
  mentor: GraduationCap,
  family: Users,
  other: Link2,
};

// Radial layout params. Tuned for 8-20 characters on a mobile-first card.
const VIEWBOX = 400;
const CENTER = VIEWBOX / 2;
const RADIUS = 150;
const NODE_RADIUS = 22;
const LABEL_OFFSET = 36; // how far outside the ring we put the name label

/**
 * Pure-SVG radial relationship map. Characters are placed around a circle,
 * clustered by `group` so house/faction members sit next to each other.
 * Edges are bezier curves colored by relationshipType; tapping one shows
 * the label. Tapping a node highlights only its edges.
 *
 * No physics, no deps — works fine for 8-20 nodes (the typical companion
 * size). If a show ever has 40+ nodes this layout would get crowded, but
 * we have bigger problems at that point.
 */
export default function RelationshipMap({ characters, relationships, groupColors }: Props) {
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ label: string; type: string } | null>(null);

  // Sort characters by group so same-group nodes end up adjacent around the
  // circle. Characters with no group land at the end.
  const ordered = useMemo(() => {
    const copy = [...characters];
    copy.sort((a, b) => {
      if (a.group === b.group) return a.name.localeCompare(b.name);
      if (!a.group) return 1;
      if (!b.group) return -1;
      return a.group.localeCompare(b.group);
    });
    return copy;
  }, [characters]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; angle: number }>();
    const n = ordered.length;
    if (n === 0) return map;
    ordered.forEach((c, i) => {
      // Start at -90deg (top) so the first node sits at 12 o'clock.
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      map.set(c.id, {
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle),
        angle,
      });
    });
    return map;
  }, [ordered]);

  // Group visually-redundant edges (same pair, same type) into one. Multi-type
  // pairs keep separate edges because they're semantically different (Shiv +
  // Nate have both "romantic" and "business" — both matter).
  const edges = useMemo(() => {
    return relationships
      .map((r) => {
        const from = positions.get(r.fromCharacterId);
        const to = positions.get(r.toCharacterId);
        if (!from || !to) return null;
        return { rel: r, from, to };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [relationships, positions]);

  const connectedCharIds = useMemo(() => {
    if (!selectedCharId) return null;
    const ids = new Set<string>([selectedCharId]);
    for (const r of relationships) {
      if (r.fromCharacterId === selectedCharId) ids.add(r.toCharacterId);
      if (r.toCharacterId === selectedCharId) ids.add(r.fromCharacterId);
    }
    return ids;
  }, [selectedCharId, relationships]);

  const presentRelTypes = useMemo(() => {
    return Array.from(new Set(relationships.map((r) => r.relationshipType))).sort();
  }, [relationships]);

  if (characters.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No characters to map yet — slide forward.</p>;
  }
  if (relationships.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] italic text-center py-8">No relationships revealed at your current position yet.</p>;
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {presentRelTypes.map((t) => {
          const Icon = REL_ICONS[t] ?? Link2;
          const color = REL_COLOR[t] ?? REL_COLOR.other;
          return (
            <span key={t} className="inline-flex items-center gap-1 text-[10px] text-[var(--foreground-muted)]">
              <Icon className="w-3 h-3" style={{ color }} />
              <span className="capitalize">{t}</span>
            </span>
          );
        })}
      </div>

      {/* SVG map */}
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="w-full h-auto"
        role="img"
        aria-label="Relationship map"
      >
        {/* Edges — render first so they sit behind nodes */}
        {edges.map(({ rel, from, to }) => {
          const color = REL_COLOR[rel.relationshipType] ?? REL_COLOR.other;
          const dim = connectedCharIds !== null
            && !(connectedCharIds.has(rel.fromCharacterId) && connectedCharIds.has(rel.toCharacterId));
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          // Bend the curve toward the center so edges don't all pile on the
          // diameter. Pull factor shrinks the line inward 15% of the way to
          // CENTER — enough to separate parallel edges visually.
          const cp = {
            x: mid.x + (CENTER - mid.x) * 0.3,
            y: mid.y + (CENTER - mid.y) * 0.3,
          };
          const path = `M ${from.x} ${from.y} Q ${cp.x} ${cp.y} ${to.x} ${to.y}`;
          return (
            <path
              key={rel.id}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeOpacity={dim ? 0.15 : 0.7}
              className="cursor-pointer transition-opacity"
              onClick={() => setSelectedEdge({ label: rel.label, type: rel.relationshipType })}
            />
          );
        })}

        {/* Nodes */}
        {ordered.map((c) => {
          const pos = positions.get(c.id);
          if (!pos) return null;
          const color = c.group ? groupColors.get(c.group) ?? "#6b7280" : "#6b7280";
          const dim = connectedCharIds !== null && !connectedCharIds.has(c.id);
          const isSelected = selectedCharId === c.id;
          // Label sits outside the ring along the same radial angle.
          const labelX = CENTER + (RADIUS + LABEL_OFFSET) * Math.cos(pos.angle);
          const labelY = CENTER + (RADIUS + LABEL_OFFSET) * Math.sin(pos.angle);
          // Anchor the text so labels don't overflow off the sides.
          const anchor = Math.abs(Math.cos(pos.angle)) < 0.2
            ? "middle"
            : Math.cos(pos.angle) > 0
            ? "start"
            : "end";
          const initial = c.name.match(/\b[A-Z]/g)?.slice(0, 2).join("") ?? c.name[0]?.toUpperCase() ?? "?";
          return (
            <g
              key={c.id}
              onClick={() => setSelectedCharId(isSelected ? null : c.id)}
              className="cursor-pointer"
              opacity={dim ? 0.3 : 1}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={NODE_RADIUS}
                fill={color}
                stroke={isSelected ? "white" : color}
                strokeWidth={isSelected ? 3 : 2}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                fontWeight={700}
                fill="white"
                pointerEvents="none"
              >
                {initial}
              </text>
              <text
                x={labelX}
                y={labelY}
                textAnchor={anchor}
                dominantBaseline="central"
                fontSize={11}
                fill="currentColor"
                className="text-[var(--foreground-muted)]"
                pointerEvents="none"
              >
                {c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Inline readout: what's selected */}
      {selectedEdge && (
        <div className="flex items-center gap-2 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: REL_COLOR[selectedEdge.type] ?? REL_COLOR.other }} />
          <span className="text-white italic">{selectedEdge.label}</span>
          <span className="text-[var(--foreground-muted)] capitalize">· {selectedEdge.type}</span>
          <button onClick={() => setSelectedEdge(null)} className="ml-auto text-[var(--foreground-muted)] hover:text-white">×</button>
        </div>
      )}
      {selectedCharId && !selectedEdge && (
        <p className="text-[10px] text-[var(--foreground-muted)] text-center">
          Showing connections for <span className="text-white font-semibold">{characters.find((c) => c.id === selectedCharId)?.name}</span>
          {" · "}
          <button onClick={() => setSelectedCharId(null)} className="underline hover:text-white">reset</button>
        </p>
      )}
      {!selectedCharId && !selectedEdge && (
        <p className="text-[10px] text-[var(--foreground-muted)] text-center">Tap a character to isolate their connections · tap an edge to read the label</p>
      )}
    </div>
  );
}
