-- CreateTable
CREATE TABLE "two_thumbs_votes" (
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_thumbs_votes_pkey" PRIMARY KEY ("user_id", "post_id")
);

-- CreateIndex
CREATE INDEX "two_thumbs_votes_post_id_idx" ON "two_thumbs_votes"("post_id");

-- AddForeignKey
ALTER TABLE "two_thumbs_votes" ADD CONSTRAINT "two_thumbs_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_thumbs_votes" ADD CONSTRAINT "two_thumbs_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
