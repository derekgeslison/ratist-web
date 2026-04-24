-- Multi-actor + name-aliases support for watch companion characters.
-- Adds a side table for actors (age variants, recasts, twins playing one
-- role) and a JSON column on characters for twist-reveal name progressions.

ALTER TABLE "companion_characters" ADD COLUMN "name_aliases" JSONB;

CREATE TABLE "companion_character_actors" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_tmdb_id" INTEGER,
    "note" TEXT,
    "visible_after" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "companion_character_actors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "companion_character_actors_character_id_idx" ON "companion_character_actors"("character_id");

ALTER TABLE "companion_character_actors"
  ADD CONSTRAINT "companion_character_actors_character_id_fkey"
  FOREIGN KEY ("character_id") REFERENCES "companion_characters"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
