-- CreateTable: user_movie_rankings
CREATE TABLE "user_movie_rankings" (
    "user_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "list_key" TEXT NOT NULL DEFAULT 'all-time',
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "user_movie_rankings_pkey" PRIMARY KEY ("user_id","movie_id","list_key")
);

-- AddForeignKey
ALTER TABLE "user_movie_rankings" ADD CONSTRAINT "user_movie_rankings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_movie_rankings" ADD CONSTRAINT "user_movie_rankings_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
