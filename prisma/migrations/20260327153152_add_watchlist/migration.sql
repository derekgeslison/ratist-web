-- CreateTable
CREATE TABLE "user_watchlist_movies" (
    "user_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_watchlist_movies_pkey" PRIMARY KEY ("user_id","movie_id")
);

-- AddForeignKey
ALTER TABLE "user_watchlist_movies" ADD CONSTRAINT "user_watchlist_movies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watchlist_movies" ADD CONSTRAINT "user_watchlist_movies_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
