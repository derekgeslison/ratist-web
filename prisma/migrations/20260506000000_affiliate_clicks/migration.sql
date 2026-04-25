-- Outbound affiliate click tracking. One row per click on Netflix/Hulu/
-- Prime/Fandango/Spotify links so the aggregate report (clicks per
-- provider per week/month) becomes leverage when approaching companies
-- that don't yet have public affiliate programs.
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "user_id" TEXT,
    "media_type" TEXT,
    "tmdb_id" INTEGER,
    "referrer_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- Primary report path: counts per (provider, time window).
CREATE INDEX "affiliate_clicks_provider_created_at_idx"
  ON "affiliate_clicks"("provider", "created_at");

-- Time-only index for the "all clicks last 7 days" admin overview.
CREATE INDEX "affiliate_clicks_created_at_idx"
  ON "affiliate_clicks"("created_at");

ALTER TABLE "affiliate_clicks" ADD CONSTRAINT
  "affiliate_clicks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
