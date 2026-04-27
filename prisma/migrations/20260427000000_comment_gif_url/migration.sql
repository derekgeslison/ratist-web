-- Add optional gif_url to comments. Comments can now be text-only, GIF-only,
-- or both — the server requires at least one to be non-empty.
ALTER TABLE "comments" ADD COLUMN "gif_url" TEXT;
