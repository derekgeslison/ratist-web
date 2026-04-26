-- Per-user watchlist settings, surfaced behind a gear icon on
-- /watchlist. autoAddToDefault preserves the existing one-tap-to-add
-- behavior; new on-mark-seen + filter + position settings are off /
-- "all" / "top" by default.
ALTER TABLE "users"
  ADD COLUMN "auto_add_to_default_watchlist" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_remove_from_watchlist_on_seen" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "default_watchlist_filter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "watchlist_add_position" TEXT NOT NULL DEFAULT 'top';
