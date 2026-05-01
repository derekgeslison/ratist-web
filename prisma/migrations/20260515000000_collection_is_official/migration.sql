-- Adds `is_official` flag to custom_collections. Powers admin-curated
-- collections that show "Curated by Ratist" instead of the admin's name
-- and feed the Featured tab on the community page.
ALTER TABLE "custom_collections"
  ADD COLUMN "is_official" BOOLEAN NOT NULL DEFAULT false;

-- Featured-tab feed orders by publishedAt within isOfficial=true.
CREATE INDEX "custom_collections_is_official_published_at_idx"
  ON "custom_collections" ("is_official", "published_at");
