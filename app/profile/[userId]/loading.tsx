export default function ProfileLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="w-24 h-24 rounded-full bg-[var(--surface-2)] shrink-0" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-6 w-48 bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-64 bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-32 bg-[var(--surface-2)] rounded" />
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-[var(--border)] mb-8">
        {[80, 64, 56, 80, 48].map((w, i) => (
          <div key={i} className="h-10 bg-[var(--surface-2)] rounded-t" style={{ width: w }} />
        ))}
      </div>
      {/* Content grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-[var(--surface-2)] rounded" />
        ))}
      </div>
    </div>
  );
}
