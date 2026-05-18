/**
 * Tiny purple "C" chip used inline on user discovery rows to flag
 * Critics. Kept compact (no full word) since it sits in dense rows
 * alongside the avatar + name + follower count. Matches the existing
 * purple accent used elsewhere for critic-mode surfaces.
 */
export default function CriticChip() {
  return (
    <span
      title="Critic"
      className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-purple-500/15 border border-purple-400/40 text-purple-300 text-[9px] font-black leading-none"
    >
      C
    </span>
  );
}
