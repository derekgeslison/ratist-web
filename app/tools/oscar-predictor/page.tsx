import { Trophy } from "lucide-react";

// Historical Best Picture winners' average Ratist-equivalent metrics
// (seeded with known data — will be enriched as community rates these films)
const CURRENT_YEAR = new Date().getFullYear();

export default function OscarPredictorPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Oscar Best Picture Predictor</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-2">
        {CURRENT_YEAR} contenders scored against historical Best Picture winner patterns.
      </p>
      <p className="text-xs text-[var(--foreground-muted)] mb-8">
        Score factors: Ratist community metrics · Director & cast prior Oscar history · Awards circuit performance · Release timing · Critical consensus
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
        <Trophy className="w-12 h-12 text-yellow-400/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Coming Soon</h2>
        <p className="text-[var(--foreground-muted)] text-sm max-w-md mx-auto">
          The Oscar Predictor activates at the start of awards season. It uses the Ratist algorithm combined with historical winner data to score each film&apos;s likelihood of taking home Best Picture.
        </p>
        <p className="text-[var(--foreground-muted)] text-sm mt-3">
          The more community members rate eligible films, the more accurate the predictions become.
        </p>
      </div>

      {/* Methodology card */}
      <div className="mt-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <h3 className="text-base font-semibold text-white mb-4">How the Score is Calculated</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          {[
            { label: "Ratist Community Rating", weight: "30%", desc: "Weighted average of all Ratist scores for the film" },
            { label: "Story & Emotive Score", weight: "20%", desc: "Best Picture winners historically score high on story + emotional impact" },
            { label: "Awards Circuit", weight: "20%", desc: "Wins/nominations at SAG, BAFTA, Guilds, Golden Globes" },
            { label: "Director / Cast Pedigree", weight: "15%", desc: "Prior Oscar history of key creative talent" },
            { label: "Critical Score", weight: "10%", desc: "Rotten Tomatoes / Metacritic consensus" },
            { label: "Release Timing", weight: "5%", desc: "Q4 releases historically outperform; wide release = broader Academy reach" },
          ].map((item) => (
            <div key={item.label} className="flex gap-3">
              <span className="text-[var(--ratist-red)] font-bold shrink-0 w-10">{item.weight}</span>
              <div>
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-[var(--foreground-muted)] text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
