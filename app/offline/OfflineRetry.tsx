"use client";

export default function OfflineRetry() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.location.reload();
      }}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-full hover:bg-[var(--ratist-red-hover)] transition-colors"
    >
      Try again
    </button>
  );
}
