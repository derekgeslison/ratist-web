"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Marquee — the neural-network visual.
 *
 * Three layers:
 *   1. Background star-field (always-on, slow shimmer)
 *   2. Mid-layer hub network (connection lines with flowing data dots)
 *   3. Foreground HUD overlay (concentric pulse rings that react to audio)
 *
 * Audio reactivity: the parent passes an HTMLAudioElement ref via the
 * `audioEl` prop. We hook a Web Audio AnalyserNode onto it and read the
 * waveform amplitude each animation frame to drive the foreground pulse
 * rings. Each new <audio> element gets its own analyser (we tear down +
 * recreate when the ref changes) — otherwise the second segment plays
 * silent because the previous AudioContext is still pinned to the prior
 * source.
 *
 * Built in pure SVG. No libraries.
 */

interface Props {
  state: "idle" | "loading" | "speaking";
  /** When state="speaking", the live audio element drives the ring pulse. */
  audioEl?: HTMLAudioElement | null;
}

const VIEWBOX_W = 800;
const VIEWBOX_H = 400;

interface Node {
  x: number; y: number; r: number; layer: "bg" | "hub";
  /** Random phase offset so they don't all pulse in sync. */
  phase: number;
}

interface Edge {
  from: number; to: number;
  /** Random offset so dash animations don't all flow at the same time. */
  phase: number;
}

// Seeded RNG so the network shape is stable across re-renders. Otherwise
// every state change reshuffles the visual — looks jittery.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateGraph(): { nodes: Node[]; edges: Edge[] } {
  const rand = mulberry32(0xCAFEBABE);
  const nodes: Node[] = [];

  // Background star-field — many small nodes, scattered.
  for (let i = 0; i < 80; i++) {
    nodes.push({
      x: rand() * VIEWBOX_W,
      y: rand() * VIEWBOX_H,
      r: 0.7 + rand() * 1.0,
      layer: "bg",
      phase: rand() * Math.PI * 2,
    });
  }

  // Hub layer — fewer, larger, organized as a loose ring around center
  // so the connections form a more "neural" looking mesh.
  const hubCount = 18;
  const cx = VIEWBOX_W / 2, cy = VIEWBOX_H / 2;
  for (let i = 0; i < hubCount; i++) {
    const angle = (i / hubCount) * Math.PI * 2 + rand() * 0.4;
    const radius = 80 + rand() * 130;
    nodes.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.7, // squashed ellipse
      r: 2.5 + rand() * 1.5,
      layer: "hub",
      phase: rand() * Math.PI * 2,
    });
  }

  // Edges between hubs — each hub connects to 2-3 nearest neighbors so
  // the mesh looks intentional, not random spaghetti.
  const edges: Edge[] = [];
  const hubStart = 80;
  for (let i = hubStart; i < nodes.length; i++) {
    const distances = [];
    for (let j = hubStart; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      distances.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
    }
    distances.sort((a, b) => a.d - b.d);
    const k = 2 + Math.floor(rand() * 2);
    for (let n = 0; n < k && n < distances.length; n++) {
      const to = distances[n].j;
      if (i < to) edges.push({ from: i, to, phase: rand() * Math.PI * 2 });
    }
  }

  return { nodes, edges };
}

export default function MarqueeVisual({ state, audioEl }: Props) {
  const { nodes, edges } = useMemo(generateGraph, []);
  const [amplitude, setAmplitude] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lastAudioElRef = useRef<HTMLAudioElement | null>(null);

  // Wire (or rewire) Web Audio analyser when the audio element changes.
  useEffect(() => {
    if (state !== "speaking" || !audioEl) {
      // Stop the RAF loop and decay amplitude to 0 over a few frames.
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const decay = () => {
        setAmplitude((a) => {
          const next = a * 0.85;
          if (next > 0.01) rafRef.current = requestAnimationFrame(decay);
          else rafRef.current = null;
          return next;
        });
      };
      decay();
      return;
    }

    // New audio element → need fresh source node. The old source can't be
    // re-attached to a different element.
    if (lastAudioElRef.current !== audioEl) {
      try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
      lastAudioElRef.current = audioEl;
    }

    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();

    if (!analyserRef.current) {
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }
    if (!sourceRef.current) {
      try {
        sourceRef.current = ctxRef.current.createMediaElementSource(audioEl);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctxRef.current.destination);
      } catch {
        // Element was already connected to another context — silently
        // bail; the visual will fall back to its idle pulse.
      }
    }

    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      analyserRef.current?.getByteTimeDomainData(buf);
      // Convert 0-255 byte (centered at 128) → 0-1 amplitude.
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128);
        if (v > peak) peak = v;
      }
      setAmplitude(peak / 128);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [state, audioEl]);

  const pulseScale = 1 + amplitude * 0.4;
  const ringOpacity = state === "speaking" ? 0.4 + amplitude * 0.6 : state === "loading" ? 0.5 : 0.2;
  const speed = state === "loading" ? 1.5 : state === "speaking" ? 1.2 : 0.6;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className="w-full h-auto select-none"
      style={{ background: "radial-gradient(ellipse at center, #1a0a0f 0%, #0a0a0a 75%)" }}
      aria-hidden
    >
      <defs>
        <filter id="marquee-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="marquee-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="marquee-core">
          <stop offset="0%" stopColor="#cc1034" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#cc1034" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#cc1034" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="marquee-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#cc1034" stopOpacity="0" />
          <stop offset="50%" stopColor="#cc1034" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#cc1034" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* HUD scanlines */}
      <g opacity="0.08">
        {Array.from({ length: 40 }).map((_, i) => (
          <line key={i} x1="0" y1={i * 10} x2={VIEWBOX_W} y2={i * 10} stroke="#cc1034" strokeWidth="0.3" />
        ))}
      </g>

      {/* Background star-field */}
      <g opacity="0.5">
        {nodes.filter((n) => n.layer === "bg").map((n, i) => (
          <circle key={`bg-${i}`} cx={n.x} cy={n.y} r={n.r} fill="#f0f0f0">
            <animate
              attributeName="opacity"
              values="0.2;0.7;0.2"
              dur={`${(4 + (i % 5)) / speed}s`}
              begin={`${n.phase}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </g>

      {/* Hub edges with flowing data */}
      <g filter="url(#marquee-glow)">
        {edges.map((e, i) => {
          const a = nodes[e.from];
          const b = nodes[e.to];
          return (
            <g key={`e-${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cc1034" strokeOpacity="0.15" strokeWidth="0.6" />
              {/* Flowing dot — animated along the line via SMIL */}
              <circle r="1.4" fill="#ffffff" opacity={state === "idle" ? 0.6 : 0.9}>
                <animate
                  attributeName="cx"
                  values={`${a.x};${b.x};${a.x}`}
                  dur={`${(3 + (i % 4)) / speed}s`}
                  begin={`${e.phase}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  values={`${a.y};${b.y};${a.y}`}
                  dur={`${(3 + (i % 4)) / speed}s`}
                  begin={`${e.phase}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </g>

      {/* Hub nodes */}
      <g filter="url(#marquee-glow)">
        {nodes.filter((n) => n.layer === "hub").map((n, i) => (
          <g key={`hub-${i}`}>
            <circle cx={n.x} cy={n.y} r={n.r * 1.8} fill="#cc1034" opacity="0.2">
              <animate
                attributeName="r"
                values={`${n.r * 1.4};${n.r * 2.4};${n.r * 1.4}`}
                dur={`${(2 + (i % 3)) / speed}s`}
                begin={`${n.phase}s`}
                repeatCount="indefinite"
              />
            </circle>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#ffffff" />
          </g>
        ))}
      </g>

      {/* Foreground HUD: core + concentric pulse rings (audio-reactive) */}
      <g transform={`translate(${VIEWBOX_W / 2} ${VIEWBOX_H / 2})`}>
        <circle r="120" fill="url(#marquee-core)" opacity={0.4 + amplitude * 0.4} />
        {[40, 60, 80, 100].map((baseR, i) => (
          <circle
            key={i}
            r={baseR * pulseScale}
            fill="none"
            stroke="#cc1034"
            strokeWidth={state === "speaking" ? 1.5 : 0.8}
            opacity={ringOpacity * (1 - i * 0.15)}
            filter="url(#marquee-glow-strong)"
          >
            {state !== "speaking" && (
              <animate
                attributeName="opacity"
                values={`${ringOpacity * (1 - i * 0.15)};${ringOpacity * (1 - i * 0.15) * 0.3};${ringOpacity * (1 - i * 0.15)}`}
                dur={`${(2.5 + i * 0.3) / speed}s`}
                begin={`${i * 0.4}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}

        {/* Corner brackets — gives the HUD a framed look */}
        {[[-100, -60], [100, -60], [-100, 60], [100, 60]].map(([bx, by], i) => {
          const flipX = bx > 0 ? -1 : 1;
          const flipY = by > 0 ? -1 : 1;
          return (
            <g key={i} transform={`translate(${bx} ${by})`}>
              <path
                d={`M 0 ${20 * flipY} L 0 0 L ${20 * flipX} 0`}
                fill="none"
                stroke="#cc1034"
                strokeWidth="2"
                opacity="0.55"
              />
            </g>
          );
        })}

        {/* MARQUEE label */}
        <text
          y="160"
          textAnchor="middle"
          fill="#f0f0f0"
          fontSize="11"
          letterSpacing="6"
          opacity="0.55"
          style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
        >
          MARQUEE
        </text>
      </g>
    </svg>
  );
}
