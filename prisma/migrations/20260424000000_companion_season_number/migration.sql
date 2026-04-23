-- Add per-season scoping to companion content rows. Nullable because movie
-- companions don't have seasons. For TV rows, backfill from the parent
-- companion's seasons_generated array (pick the max since the nuclear-wipe
-- era ensured at most one season's content survived per companion).

ALTER TABLE "companion_characters" ADD COLUMN "season_number" INTEGER;
ALTER TABLE "companion_relationships" ADD COLUMN "season_number" INTEGER;
ALTER TABLE "companion_timeline_events" ADD COLUMN "season_number" INTEGER;
ALTER TABLE "companion_glossary_terms" ADD COLUMN "season_number" INTEGER;

-- Backfill: TV companion rows inherit their parent's latest (and only,
-- given the old nuclear wipe) season. Movie companions stay NULL.
UPDATE "companion_characters" c
SET "season_number" = (
  SELECT (SELECT MAX(s) FROM UNNEST(w.seasons_generated) s)
  FROM "watch_companions" w
  WHERE w.id = c.companion_id AND w.media_type = 'tv'
);
UPDATE "companion_relationships" r
SET "season_number" = (
  SELECT (SELECT MAX(s) FROM UNNEST(w.seasons_generated) s)
  FROM "watch_companions" w
  WHERE w.id = r.companion_id AND w.media_type = 'tv'
);
UPDATE "companion_timeline_events" t
SET "season_number" = (
  SELECT (SELECT MAX(s) FROM UNNEST(w.seasons_generated) s)
  FROM "watch_companions" w
  WHERE w.id = t.companion_id AND w.media_type = 'tv'
);
UPDATE "companion_glossary_terms" g
SET "season_number" = (
  SELECT (SELECT MAX(s) FROM UNNEST(w.seasons_generated) s)
  FROM "watch_companions" w
  WHERE w.id = g.companion_id AND w.media_type = 'tv'
);

CREATE INDEX "companion_characters_companion_id_season_number_idx" ON "companion_characters"("companion_id", "season_number");
CREATE INDEX "companion_relationships_companion_id_season_number_idx" ON "companion_relationships"("companion_id", "season_number");
CREATE INDEX "companion_timeline_events_companion_id_season_number_idx" ON "companion_timeline_events"("companion_id", "season_number");
CREATE INDEX "companion_glossary_terms_companion_id_season_number_idx" ON "companion_glossary_terms"("companion_id", "season_number");
