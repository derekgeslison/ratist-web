import Anthropic from "@anthropic-ai/sdk";
import type { CompanionGroundingData } from "../watch-companion-grounding";
import {
  type DraftCharacter,
  type DraftRelationship,
  type PriorSeasonCanon,
  RELATIONSHIP_TYPES,
  type RelationshipType,
  VISIBLE_AFTER_SCHEMA,
  VISIBLE_AFTER_GUIDANCE,
  normVisibleAfter,
  normalizeLabel,
  formatGroundingContext,
  formatPriorSeasonCanon,
  callTool,
} from "./shared";

const SYSTEM_PROMPT = `You are drafting the RELATIONSHIPS section of a Watch Companion — pairwise connections between characters. Family, business, romance, rivalries.

## Your only job

Emit 5–30 relationships referencing only characters in the provided list.

- "fromName" / "toName" — MUST be a character name from the list, EXACT.
- **NEVER emit a relationship where fromName === toName.** Self-relationships are a bug.
- "relationshipType": one of ${RELATIONSHIP_TYPES.join(", ")}.
- "label" — short, modern, plainspoken English. "parent of", "ex-spouse", "rival", "sibling of", "mentor of", "business partner". The label appears as a pill on a mobile card — keep it as short as it can be while staying accurate. Avoid archaic wording like "paramour", "beau", "suitor".
- "directed" — false for symmetric (siblings, spouses, allies). True for directed (parent-of, reports-to).
- "visibleAfter" — when the viewer first learns about this relationship.

Only relationships. Don't emit characters, facts, timeline events, or glossary entries.

## Relationships are ENDURING STATES — not one-time events

A relationship describes an ongoing connection between two characters: who they are to each other. "Parent of", "ex-spouse", "rival", "business partner", "best friend", "mentor of". It persists across scenes.

A one-time thing that HAPPENED between two characters is NOT a relationship — it belongs in the timeline (as a beat) or as a character fact (on one of them). Dead giveaway: if the label starts with or implies a past-tense verb ("betrayed", "killed", "revealed to", "met", "first disclosed", "confronted", "lied to about", "proposed to") — that's an event, not a relationship.

❌ WRONG (events masquerading as relationships):
- { label: "betrayed", relationshipType: "rivalry" } — one-time event, goes in timeline.
- { label: "first disclosed machine use to", relationshipType: "alliance" } — Primer. This is a timeline beat or a fact on Abe.
- { label: "killed" } — timeline beat + fact (death).
- { label: "proposed to" } — timeline beat. The resulting marriage IS a relationship ("spouse of").
- { label: "confronted about the affair" } — timeline beat.
- { label: "revealed identity to" } — timeline beat + a reveal fact on the revealer.

✅ RIGHT (enduring states only):
- { label: "rival of" } — ongoing rivalry.
- { label: "former partner of" } — they WERE partners; the breakup is in the timeline.
- { label: "wary of" } — ongoing wariness is fine.
- { label: "sworn enemy of" } — a status that persists.

Rule of thumb: if you'd finish the sentence with "(past-tense verb) and that's why they currently are X to each other", emit the RELATIONSHIP as the "X to each other" part and let the causing event show up as a timeline beat or fact. The relationship is the residue, not the incident.

## Label length — use exactly as many words as needed, no more

The label renders as a small pill on a mobile card, so short is better when short is accurate. But don't over-compress: sometimes every word is load-bearing and cutting them loses information a viewer actually needs.

**Cut words that are filler, not signal.** If the label would still mean the same thing with a word removed, remove it. If removing it changes the meaning, keep it.

Good short labels (2–3 words when that's enough): "mentor of", "ex-spouse", "political rival", "business partner", "past affair with", "reports to", "best friend", "estranged from".

Good longer labels (keep when every word adds info):
- "senior communications aide to" — "senior" signals seniority, "communications" is the specific function. Both earn their keep.
- "adopted parent of" — "adopted" is a material fact about the relationship.
- "step-sibling of" — "step-" is material.

**Universally-known acronyms are fine** — use them. "CEO of", "CFO of", "COO of", "CTO of", "CMO of", "VP of", "SVP of", "HR head of", "PM of", "MD of" all read cleanly. Don't write "Chief Operating Officer of" when "COO of" works. Other generally-understood ones: FBI, CIA, DA, AG, NYPD, DOJ, CEO, IPO, R&D.

But **show-specific acronyms stay spelled out** in labels — "PGM", "ATN", "GoJo" (Succession), "SAMCRO" (Sons of Anarchy), "KISS" the band. These belong in the glossary; a viewer who doesn't know the acronym yet shouldn't have to guess from a relationship pill.

Verbose labels that ARE writing prose (compress these):
- ❌ "mentor to during management training" → ✅ "mentor of" — the when/context belongs in a character fact.
- ❌ "unconventional intimate dynamic with" → ✅ "intimate with" or just "complicated with".
- ❌ "former romantic interest from college" → ✅ "past relationship with" — the college part is a fact.
- ❌ "business collaborator on the Vaulter acquisition" → ✅ "business partner" — Vaulter detail is a fact.
- ❌ "adoptive father who raised her" → ✅ "adoptive parent of" — the "raised her" is implied by adoption.

Rule of thumb: if the extra words are describing WHEN or HOW or WHY the relationship exists, drop them from the label and move them to a character fact if they matter. If the extra words are describing WHAT the relationship IS (role, title, kind), keep them.

## When to split into multiple pills vs combine with a slash

Two different relationshipTypes between the same pair → TWO separate entries. A slash can't bridge type boundaries (they color-code differently and reveal at different times).

✅ SPLIT (two entries, different types):
- { fromName: "Shiv Roy", toName: "Nate Sofrelli", relationshipType: "romantic", label: "past relationship with", directed: false, visibleAfter: { season: 1, episode: 4, ... } }
- { fromName: "Shiv Roy", toName: "Nate Sofrelli", relationshipType: "business", label: "political contact", directed: false, visibleAfter: { season: 1, episode: 1, ... } }

❌ WRONG (collapsing two TYPES with a slash):
- { relationshipType: "romantic", label: "former romantic interest / political contact" }

But — if two labels describe the **same connection through different lenses** (same relationshipType, same direction, same reveal point), a slash IS the right move. It keeps the pill count small and reads naturally.

✅ SLASH (synonymous / overlapping labels, one entry):
- { relationshipType: "alliance", label: "friend/confidant of" } — one bond, two lenses.
- { relationshipType: "mentor", label: "advisor/mentor of" } — same role, two words for it.
- { relationshipType: "business", label: "CFO/right hand" } — overlapping job and metaphor.

Rule of thumb: if you'd need two separate visibleAfter tags or two different relationshipTypes to capture it, split. If it's ONE bond you're just groping for the right word for, slash it and keep going.

## Gender-agnostic vocabulary

Use neutral terms unless gender is genuinely load-bearing:
- **Siblings:** "sibling of" / "siblings" (not "brother" / "sister"). "half-sibling of" for half-siblings.
- **Parents / children:** "parent of" / "child of" (not "father of" / "son of").
- **Spouses:** "spouse of" / "ex-spouse of" (not "husband" / "wife").
- **Partners:** "partner of" / "ex-partner of" (not "boyfriend" / "girlfriend").
- **Niblings (nieces/nephews):** "nibling of" / "niblings" (not "niece" / "nephew"). Compound forms keep the modifier hyphenated: "great-nibling of" / "grand-nibling of". Example: Greg Hirsch is "great-nibling of Logan Roy", NOT "great-nephew of". This is a real, gender-neutral term — use it.

Uncle/aunt/cousin can stay gendered — they're more distinct and not asked to consolidate.

## Half-siblings MUST be distinguished from full siblings

If a character shares only one parent with someone, they are a half-sibling, NOT a full sibling. This distinction is usually plot-important (different mother/father = different inheritance claim, different family dynamics) and collapsing it into "sibling of" is a factual error.

Use "half-sibling of" whenever the grounding data indicates different parentage. Use "sibling of" ONLY for full siblings.

✅ CORRECT (Succession):
- { fromName: "Connor Roy", toName: "Kendall Roy", label: "half-sibling of", directed: false } — Connor is Logan's son from his first marriage; Kendall, Shiv, and Roman share a different mother.
- { fromName: "Connor Roy", toName: "Siobhan 'Shiv' Roy", label: "half-sibling of", directed: false }
- { fromName: "Connor Roy", toName: "Roman Roy", label: "half-sibling of", directed: false }
- { fromName: "Kendall Roy", toName: "Siobhan 'Shiv' Roy", label: "sibling of", directed: false } — full siblings.

❌ WRONG:
- { fromName: "Connor Roy", toName: "Kendall Roy", label: "sibling of" } — loses the half-sibling fact.

Also pay attention to step-siblings and adoptive siblings when the grounding data supports it — "step-sibling of" and "adopted sibling of" are the right labels, not "sibling of".

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
  priorCanon: PriorSeasonCanon | null = null,
): Promise<DraftRelationship[]> {
  const charList = characters.map((c) => `- ${c.name}`).join("\n");
  const userMessage = formatGroundingContext(grounding, season, { includeCast: false })
    + formatPriorSeasonCanon(priorCanon)
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
