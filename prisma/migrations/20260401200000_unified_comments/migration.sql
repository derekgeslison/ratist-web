-- CreateTable: comments (unified)
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: comment_likes
CREATE TABLE "comment_likes" (
    "user_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("user_id","comment_id")
);

-- CreateTable: post_likes
CREATE TABLE "post_likes" (
    "user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("user_id","target_type","target_id")
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_target_type_target_id_idx" ON "comments"("target_type", "target_id");
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate review_comments into comments table
INSERT INTO "comments" ("id", "user_id", "target_type", "target_id", "parent_id", "text", "created_at")
SELECT rc.id, rc.user_id, 'review', rc.rating_id, rc.parent_id, rc.text, rc.created_at
FROM "review_comments" rc;

-- Migrate blog_comments into comments table
INSERT INTO "comments" ("id", "user_id", "target_type", "target_id", "parent_id", "text", "created_at")
SELECT bc.id, bc.author_id, 'blog', bc.post_id, NULL, bc.content, bc.created_at
FROM "blog_comments" bc;

-- Migrate review_likes into post_likes (these are likes on the review/rating itself, not comments)
INSERT INTO "post_likes" ("user_id", "target_type", "target_id", "created_at")
SELECT rl.user_id, 'review', rl.rating_id, rl.created_at
FROM "review_likes" rl;

-- Drop old tables
ALTER TABLE "review_comments" DROP CONSTRAINT IF EXISTS "review_comments_user_id_fkey";
ALTER TABLE "review_comments" DROP CONSTRAINT IF EXISTS "review_comments_rating_id_fkey";
ALTER TABLE "review_comments" DROP CONSTRAINT IF EXISTS "review_comments_parent_id_fkey";
DROP TABLE "review_comments";

ALTER TABLE "blog_comments" DROP CONSTRAINT IF EXISTS "blog_comments_post_id_fkey";
ALTER TABLE "blog_comments" DROP CONSTRAINT IF EXISTS "blog_comments_author_id_fkey";
DROP TABLE "blog_comments";

ALTER TABLE "review_likes" DROP CONSTRAINT IF EXISTS "review_likes_user_id_fkey";
ALTER TABLE "review_likes" DROP CONSTRAINT IF EXISTS "review_likes_rating_id_fkey";
DROP TABLE "review_likes";
