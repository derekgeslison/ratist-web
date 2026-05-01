-- Curator-toggled flag: render ordinal numbers (1, 2, 3...) on each
-- item in the public detail view. Used for canonical watch orders on
-- saga collections (MCU chronological, Wizarding World story order, etc.).
ALTER TABLE "custom_collections"
  ADD COLUMN "numbered_order" BOOLEAN NOT NULL DEFAULT false;
