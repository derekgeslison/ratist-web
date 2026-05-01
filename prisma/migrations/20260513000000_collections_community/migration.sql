-- Collections community layer: visibility/publish flow on existing
-- custom_collections, free-form tags, save bookmarks, themed-prompts
-- table, and a "linked collection" embed on comments (the
-- "reply with your own list" affordance). All existing rows stay
-- private+draft via the column defaults so nothing leaks public.

-- ─── custom_collections: publish/visibility/engagement columns ───────────
ALTER TABLE "custom_collections"
  ADD COLUMN "visibility"     TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN "slug"           TEXT,
  ADD COLUMN "published_at"   TIMESTAMP(3),
  ADD COLUMN "cover_path"     TEXT,
  ADD COLUMN "theme_prompt_id" TEXT,
  ADD COLUMN "save_count"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "view_count"     INTEGER NOT NULL DEFAULT 0;

-- (user_id, slug) unique. Multiple NULL slugs per user are allowed by
-- Postgres' default unique-NULL semantics, which is what we want for
-- drafts (slug is only assigned at first publish).
CREATE UNIQUE INDEX "custom_collections_user_id_slug_key"
  ON "custom_collections" ("user_id", "slug");

-- Community feed sort indexes — covers "public newest" and "public most-saved".
CREATE INDEX "custom_collections_visibility_published_at_idx"
  ON "custom_collections" ("visibility", "published_at");
CREATE INDEX "custom_collections_visibility_save_count_idx"
  ON "custom_collections" ("visibility", "save_count");
CREATE INDEX "custom_collections_theme_prompt_id_idx"
  ON "custom_collections" ("theme_prompt_id");

-- ─── custom_collection_items: per-entry curator blurb ───────────────────
ALTER TABLE "custom_collection_items"
  ADD COLUMN "blurb" TEXT;

-- ─── comments: linked-collection embed ─────────────────────────────────
-- Set when a user files a comment via "reply with your own list" so the
-- comment renders an inline mini-tile of the linked collection. Set null
-- on collection delete so the comment text survives.
ALTER TABLE "comments"
  ADD COLUMN "linked_collection_id" TEXT;

CREATE INDEX "comments_linked_collection_id_idx"
  ON "comments" ("linked_collection_id");

-- ─── collection_tags ────────────────────────────────────────────────────
-- Mirrors forum_thread_tags exactly: free-form lowercased strings,
-- sanitized client-side, no admin allowlist. Shown only on public
-- collections in the community feed.
CREATE TABLE "collection_tags" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "collection_id" TEXT NOT NULL REFERENCES "custom_collections"("id") ON DELETE CASCADE,
  "tag"           TEXT NOT NULL
);

CREATE UNIQUE INDEX "collection_tags_collection_id_tag_key"
  ON "collection_tags" ("collection_id", "tag");
CREATE INDEX "collection_tags_tag_idx"
  ON "collection_tags" ("tag");

-- ─── collection_saves ──────────────────────────────────────────────────
-- Bookmark / "come back to this" on a public collection. Composite PK
-- doubles as the uniqueness guarantee. saveCount on the parent is kept
-- in sync by the toggle endpoint, not via triggers — keeps the schema
-- portable and lets us batch-recompute if drift is ever detected.
CREATE TABLE "collection_saves" (
  "user_id"       TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "collection_id" TEXT NOT NULL REFERENCES "custom_collections"("id") ON DELETE CASCADE,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "collection_id")
);

-- Reverse-direction indexes for "what did I save (newest first)" and
-- "who saved this collection (newest first)".
CREATE INDEX "collection_saves_user_id_created_at_idx"
  ON "collection_saves" ("user_id", "created_at");
CREATE INDEX "collection_saves_collection_id_created_at_idx"
  ON "collection_saves" ("collection_id", "created_at");

-- ─── collection_prompts ─────────────────────────────────────────────────
-- Admin-authored themed prompts ("Films that aged like wine"). Phase 1
-- ships the table; Phase 3 adds the admin UI + Theme tab. Shipping the
-- column now avoids a follow-up migration when the feature lands.
CREATE TABLE "collection_prompts" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "active_from"   TIMESTAMP(3),
  "active_to"     TIMESTAMP(3),
  "featured"      BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL
);

CREATE INDEX "collection_prompts_active_from_active_to_idx"
  ON "collection_prompts" ("active_from", "active_to");
CREATE INDEX "collection_prompts_featured_idx"
  ON "collection_prompts" ("featured");

-- ─── deferred FKs ───────────────────────────────────────────────────────
-- Added after collection_prompts exists.
ALTER TABLE "custom_collections"
  ADD CONSTRAINT "custom_collections_theme_prompt_id_fkey"
  FOREIGN KEY ("theme_prompt_id") REFERENCES "collection_prompts"("id") ON DELETE SET NULL;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_linked_collection_id_fkey"
  FOREIGN KEY ("linked_collection_id") REFERENCES "custom_collections"("id") ON DELETE SET NULL;
