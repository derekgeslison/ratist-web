-- Track Google Cloud Vision SafeSearch results on movie posters.
-- poster_scanned_at is set on every scan (clean or hit) so the
-- backfill script can skip already-scanned rows. poster_scan_result
-- stores the raw SafeSearch verdict so we can re-tune the threshold
-- later without re-running the API.
ALTER TABLE "movies"
  ADD COLUMN "poster_scan_result" JSONB,
  ADD COLUMN "poster_scanned_at"  TIMESTAMP(3);
