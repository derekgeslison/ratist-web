import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftRelationship,
  RELATIONSHIP_TYPES,
  type RelationshipType,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  normalizeLabel,
  formatGroundingContext,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the RELATIONSHIPS section of a Watch Companion — pairwise connections between characters. Family, business, romance, rivalries.

## Your only job

Emit 5–30 relationships referencing only characters in the provided list.

- "fromName" / "toName" — MUST be a character name from the list, EXACT.
- **NEVER emit a relationship where fromName === toName.** Self-relationships are a bug.
- "relationshipType": one of ${RELATIONSHIP_TYPES.join(", ")}.
- "label" — short, modern, plainspoken English. "father of", "ex-spouse", "rival", "past relationship with", "political contact". Avoid archaic wording like "paramour", "beau", "suitor".
- "directed" — false for symmetric (siblings, spouses, allies). True for directed (parent-of, reports-to).
- "visibleAfter" — when the viewer first learns about this relationship.

Only relationships. Don't emit characters, facts, timeline events, or glossary entries.

## MULTIPLE RELATIONSHIPS BETWEEN THE SAME PAIR ARE MANDATORY

When two characters' connection spans different types, split into separate entries. Never combine with a slash.

✅ CORRECT (two entries):
- { fromName: "Shiv Roy", toName: "Nate Sofrelli", relationshipType: "romantic", label: "past relationship with", directed: false, visibleAfter: { season: 1, episode: 4, ... } }
- { fromName: "Shiv Roy", toName: "Nate Sofrelli", relationshipType: "business", label: "political contact", directed: false, visibleAfter: { season: 1, episode: 1, ... } }

❌ WRONG:
- { relationshipType: "romantic", label: "former romantic interest / political contact" }

## Gender-agnostic vocabulary

Use neutral terms unless gender is genuinely load-bearing:
- **Siblings:** "sibling of" / "siblings" (not "brother" / "sister"). "half-sibling of" for half-siblings.
- **Parents / children:** "parent of" / "child of" (not "father of" / "son of").
- **Spouses:** "spouse of" / "ex-spouse of" (not "husband" / "wife").
- **Partners:** "partner of" / "ex-partner of" (not "boyfriend" / "girlfriend").

Uncle/aunt/nephew/niece/cousin can stay gendered — they're more distinct.

${VISIBLE_AFTER_GUIDANCE}

## Quality bar

- Skip obvious relationships (everyone already knows parent-to-child is two-way).
- Surface non-obvious ones — ex-spouses, mentors, business rivals, secret allies.
- Don't invent relationships not supported by the grounding data.`;

const TOOL: Anthropic.Tool = {
  name: "emit_relationships",
  description: "Emit relationships for a Watch Companion. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fromName: { type: "string" },
            toName: { type: "string" },
            relationshipType: { type: "string", enum: [...RELATIONSHIP_TYPES] },
            label: { type: "string" },
            directed: { type: "boolean" },
            visibleAfter: VISIBLE_AFTER_SCHEMA,
          },
          required: ["fromName", "toName", "relationshipType", "label", "directed", "visibleAfter"],
          additionalProperties: false,
        },
      },
    },
    required: ["relationships"],
    additionalProperties: false,
  },
};

export async function draftRelationships(
  client: Anthropic,
  grounding: CompanionGroundingData,
  season: number | null,
  characters: DraftCharacter[],
): Promise<DraftRelationship[]> {
  const charList = characters.map((c) => `- ${c.name}`).join("\n");
  const userMessage = formatGroundingContext(grounding, season, { includeCast: false })
    + `\n\n## Characters already drafted (reference these EXACTLY by name)\n\n${charList}`
    + `\n\nEmit the relationships now. Every fromName and toName must match one of the names above exactly.`;

  const result = await callTool<{ relationships: unknown[] }>({
    client,
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tool: TOOL,
    maxTokens: 4096,
  });

  const nameSet = new Set(characters.map((c) => c.name));
  return Array.isArray(result.relationships)
    ? result.relationships
        .filter((r): r is DraftRelationship => typeof r === "object" && r !== null)
        .map((r) => ({
          fromName: typeof r.fromName === "string" ? r.fromName : "",
          toName: typeof r.toName === "string" ? r.toName : "",
          relationshipType: (RELATIONSHIP_TYPES as readonly string[]).includes(r.relationshipType) ? (r.relationshipType as RelationshipType) : "other",
          label: normalizeLabel(typeof r.label === "string" && r.label.length > 0 ? r.label.slice(0, 80) : "related to"),
          visibleAfter: normVisibleAfter(r.visibleAfter),
          directed: r.directed !== false,
        }))
        .filter((r) => {
          if (!nameSet.has(r.fromName) || !nameSet.has(r.toName)) return false;
          return r.fromName.trim().toLowerCase() !== r.toName.trim().toLowerCase();
        })
        .slice(0, 60)
    : [];
}
