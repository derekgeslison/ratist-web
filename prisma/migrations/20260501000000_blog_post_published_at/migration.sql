-- Add a publishedAt timestamp to BlogPost so the public-facing date
-- shows when the post actually went live (instead of when it was first
-- saved as a draft). Also lets admins schedule posts to publish at a
-- future date — public queries filter publishedAt <= now() so a future
-- value keeps the post hidden from readers but visible to admins.
--
-- Backfill: every already-published post gets publishedAt = createdAt
-- so the public list keeps showing them after the column is added.
-- Drafts stay null (they have no go-live date).

ALTER TABLE "blog_posts"
  ADD COLUMN "published_at" TIMESTAMP(3);

UPDATE "blog_posts"
  SET "published_at" = "created_at"
  WHERE "published" = true AND "published_at" IS NULL;

CREATE INDEX "blog_posts_type_published_published_at_idx"
  ON "blog_posts"("type", "published", "published_at");
