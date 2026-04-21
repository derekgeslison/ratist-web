import { writeFileSync } from "fs";
import { renderMovieMapSvg } from "../lib/ai/movie-map-render";
import type { MovieMapDraft } from "../lib/ai/movie-map-draft";

const timeline: MovieMapDraft = {
  mapType: "timeline",
  title: "Memento — Two Paths",
  summary: "Leonard's memory disorder is traced by two interleaved timelines: a colour sequence running backward and a black-and-white sequence running forward, converging at the film's middle.",
  legend: [
    { label: "Colour — reverse", color: "#e53e3e" },
    { label: "B&W — forward", color: "#3182ce" },
  ],
  lanes: ["Colour — reverse", "B&W — forward"],
  nodes: [
    { id: "c1", label: "Kills Teddy", group: "Colour — reverse", timelineMarker: "Scene 22", notes: "Film opens here chronologically last" },
    { id: "c2", label: "Meets Natalie", group: "Colour — reverse", timelineMarker: "Scene 18", notes: null },
    { id: "c3", label: "Gets tattoo", group: "Colour — reverse", timelineMarker: "Scene 12", notes: null },
    { id: "c4", label: "Photo of Teddy", group: "Colour — reverse", timelineMarker: "Scene 6", notes: null },
    { id: "b1", label: "Motel call", group: "B&W — forward", timelineMarker: "Scene 1", notes: "First chronologically" },
    { id: "b2", label: "Sammy flashback", group: "B&W — forward", timelineMarker: "Scene 5", notes: null },
    { id: "b3", label: "Drives to lot", group: "B&W — forward", timelineMarker: "Scene 11", notes: null },
    { id: "b4", label: "Burns evidence", group: "B&W — forward", timelineMarker: "Scene 17", notes: "Lanes converge here" },
  ],
  edges: [
    { from: "c4", to: "c3", kind: "causal", label: null },
    { from: "c3", to: "c2", kind: "causal", label: null },
    { from: "c2", to: "c1", kind: "causal", label: "kills" },
    { from: "b1", to: "b2", kind: "flashback", label: "remembers" },
    { from: "b2", to: "b3", kind: "causal", label: null },
    { from: "b3", to: "b4", kind: "causal", label: null },
    { from: "b4", to: "c1", kind: "reveal", label: "lanes meet" },
  ],
};

const nested: MovieMapDraft = {
  mapType: "nested_layers",
  title: "Inception — The Five Levels",
  summary: "Cobb's team descends through three nested dream layers to plant an idea in Fischer's mind. Reality and limbo bookend the journey.",
  legend: [
    { label: "Reality", color: "#a1a1aa" },
    { label: "L1 — Van", color: "#3182ce" },
    { label: "L2 — Hotel", color: "#38a169" },
    { label: "L3 — Fortress", color: "#d69e2e" },
    { label: "Limbo", color: "#805ad5" },
  ],
  lanes: ["Reality", "L1 — Van", "L2 — Hotel", "L3 — Fortress", "Limbo"],
  nodes: [
    { id: "r1", label: "Plane departs", group: "Reality", timelineMarker: "0h", notes: "10h flight, Sydney → LA" },
    { id: "r2", label: "Plane lands", group: "Reality", timelineMarker: "10h", notes: null },
    { id: "l1-1", label: "Van chase", group: "L1 — Van", timelineMarker: "1 week", notes: null },
    { id: "l1-2", label: "Van falls", group: "L1 — Van", timelineMarker: "End", notes: "Kick 1" },
    { id: "l2-1", label: "Hotel corridor", group: "L2 — Hotel", timelineMarker: "6 months", notes: "No gravity" },
    { id: "l2-2", label: "Elevator kick", group: "L2 — Hotel", timelineMarker: "End", notes: null },
    { id: "l3-1", label: "Fortress assault", group: "L3 — Fortress", timelineMarker: "10 years", notes: null },
    { id: "l3-2", label: "Dying room", group: "L3 — Fortress", timelineMarker: "End", notes: null },
    { id: "limbo-1", label: "Cobb & Mal's city", group: "Limbo", timelineMarker: "50+ years", notes: "Built together" },
  ],
  edges: [
    { from: "r1", to: "l1-1", kind: "transform", label: "sedate" },
    { from: "l1-1", to: "l2-1", kind: "transform", label: "dream deeper" },
    { from: "l2-1", to: "l3-1", kind: "transform", label: null },
    { from: "l3-1", to: "limbo-1", kind: "flashback", label: "Cobb falls" },
    { from: "l3-2", to: "l2-2", kind: "causal", label: "kick" },
    { from: "l2-2", to: "l1-2", kind: "causal", label: "kick" },
    { from: "l1-2", to: "r2", kind: "causal", label: "wake" },
  ],
};

const web: MovieMapDraft = {
  mapType: "web",
  title: "Magnolia — Intersecting Lives",
  summary: "Nine Los Angeles strangers' lives collide over one rainy day, linked by regret, estrangement, and coincidence.",
  legend: [],
  lanes: [],
  nodes: [
    { id: "earl", label: "Earl Partridge", group: "Dying fathers", timelineMarker: null, notes: null },
    { id: "jimmy", label: "Jimmy Gator", group: "Dying fathers", timelineMarker: null, notes: null },
    { id: "frank", label: "Frank Mackey", group: "Estranged children", timelineMarker: null, notes: null },
    { id: "claudia", label: "Claudia Gator", group: "Estranged children", timelineMarker: null, notes: null },
    { id: "linda", label: "Linda Partridge", group: "Spouses", timelineMarker: null, notes: null },
    { id: "phil", label: "Phil Parma (nurse)", group: "Caregivers", timelineMarker: null, notes: null },
    { id: "jim", label: "Officer Jim Kurring", group: "Caregivers", timelineMarker: null, notes: null },
    { id: "donnie", label: "Donnie Smith", group: "Former quiz kids", timelineMarker: null, notes: null },
    { id: "stanley", label: "Stanley Spector", group: "Former quiz kids", timelineMarker: null, notes: null },
  ],
  edges: [
    { from: "earl", to: "frank", kind: "connection", label: "father of" },
    { from: "jimmy", to: "claudia", kind: "connection", label: "father of" },
    { from: "earl", to: "linda", kind: "connection", label: null },
    { from: "phil", to: "earl", kind: "connection", label: "cares for" },
    { from: "jim", to: "claudia", kind: "connection", label: "falls for" },
    { from: "donnie", to: "stanley", kind: "parallel", label: "past / future" },
    { from: "frank", to: "earl", kind: "reveal", label: "returns" },
  ],
};

const tenetSeq: MovieMapDraft = {
  mapType: "sequence",
  title: "Tenet — In Narrative Order",
  summary: "A CIA operative recruited into a shadowy war involving objects and people whose time flows backward. The film's second half loops back through the first half in inverse order.",
  legend: [],
  lanes: [],
  nodes: [
    { id: "s1", label: "Opera siege", group: null, timelineMarker: "Open", notes: "Protagonist captured, swallows cyanide pill, wakes up recruited" },
    { id: "s2", label: "Mumbai arms dealer", group: null, timelineMarker: "+2", notes: "First encounter with inverted bullets — Priya introduces Tenet" },
    { id: "s3", label: "Oslo freeport", group: null, timelineMarker: "+3", notes: "Heist pre-planning with Neil. Turnstile glimpsed" },
    { id: "s4", label: "Freeport heist", group: null, timelineMarker: "+4", notes: "Two versions of Protagonist fight, one inverted" },
    { id: "s5", label: "Tallinn chase", group: null, timelineMarker: "+5", notes: "Inverted BMW, algorithm briefcase, Kat shot" },
    { id: "s6", label: "Inverted Tallinn", group: null, timelineMarker: "-5", notes: "Protagonist moves backward through same chase to save Kat" },
    { id: "s7", label: "Back to Oslo", group: null, timelineMarker: "-4", notes: "Reverses to meet his past self at the turnstile" },
    { id: "s8", label: "Stalsk-12 assault", group: null, timelineMarker: "-2", notes: "Temporal pincer — two teams from opposite time directions" },
    { id: "s9", label: "Algorithm buried", group: null, timelineMarker: "Close", notes: "Neil sacrifices himself, loop completes, posterity saved" },
  ],
  edges: [
    { from: "s1", to: "s2", kind: "causal", label: null },
    { from: "s5", to: "s6", kind: "transform", label: "invert" },
    { from: "s9", to: "s1", kind: "reveal", label: "loop" },
  ],
};

const tenet: MovieMapDraft = {
  mapType: "timeline",
  title: "Tenet — Forward and Reverse",
  summary: "A CIA operative recruited into a shadowy war involving objects and people whose time flows backward. The film's second half loops back through the first half in inverse order.",
  legend: [
    { label: "Forward time", color: "#3182ce" },
    { label: "Inverted time", color: "#e53e3e" },
  ],
  lanes: ["Forward time", "Inverted time"],
  nodes: [
    { id: "n1", label: "Opera siege", group: "Forward time", timelineMarker: "Open", notes: "Protagonist captured, swallows cyanide pill, wakes up recruited" },
    { id: "n2", label: "Mumbai arms dealer", group: "Forward time", timelineMarker: "+2", notes: "First encounter with inverted bullets — Priya introduces Tenet" },
    { id: "n3", label: "Oslo freeport", group: "Forward time", timelineMarker: "+3", notes: "Heist pre-planning with Neil. Turnstile glimpsed" },
    { id: "n4", label: "Freeport heist", group: "Forward time", timelineMarker: "+4", notes: "Two versions of Protagonist fight, one inverted" },
    { id: "n5", label: "Tallinn chase", group: "Forward time", timelineMarker: "+5", notes: "Inverted BMW, algorithm briefcase, Kat shot" },
    { id: "n6", label: "Inverted Tallinn", group: "Inverted time", timelineMarker: "-5", notes: "Protagonist now moves backward through same chase to save Kat" },
    { id: "n7", label: "Back to Oslo", group: "Inverted time", timelineMarker: "-4", notes: "Reverses to meet his past self at the turnstile" },
    { id: "n8", label: "Stalsk-12 assault", group: "Inverted time", timelineMarker: "-2", notes: "Temporal pincer — two teams from opposite time directions" },
    { id: "n9", label: "Algorithm buried", group: "Inverted time", timelineMarker: "Close", notes: "Neil sacrifices himself, loop completes, posterity saved" },
  ],
  edges: [
    { from: "n1", to: "n2", kind: "causal", label: null },
    { from: "n2", to: "n3", kind: "causal", label: null },
    { from: "n3", to: "n4", kind: "causal", label: null },
    { from: "n4", to: "n5", kind: "causal", label: null },
    { from: "n5", to: "n6", kind: "transform", label: "invert" },
    { from: "n6", to: "n7", kind: "causal", label: null },
    { from: "n7", to: "n8", kind: "causal", label: null },
    { from: "n8", to: "n9", kind: "causal", label: null },
    { from: "n9", to: "n1", kind: "reveal", label: "loop" },
  ],
};

for (const [name, draft] of [["timeline", timeline], ["nested", nested], ["web", web], ["tenet", tenet], ["tenet-seq", tenetSeq]] as const) {
  const svg = renderMovieMapSvg(draft);
  writeFileSync(`./scripts/test-output-${name}.svg`, svg, "utf-8");
  console.log(`wrote scripts/test-output-${name}.svg — ${svg.length} bytes`);
}
