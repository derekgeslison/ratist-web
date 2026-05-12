-- CreateTable
CREATE TABLE "episode_ratings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "show_tmdb_id" INTEGER NOT NULL,
    "season_number" INTEGER NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "episode_ratings_user_id_show_tmdb_id_idx" ON "episode_ratings"("user_id", "show_tmdb_id");

-- CreateIndex
CREATE INDEX "episode_ratings_show_tmdb_id_season_number_episode_number_idx" ON "episode_ratings"("show_tmdb_id", "season_number", "episode_number");

-- CreateIndex
CREATE UNIQUE INDEX "episode_ratings_user_id_show_tmdb_id_season_number_episode__key" ON "episode_ratings"("user_id", "show_tmdb_id", "season_number", "episode_number");

-- AddForeignKey
ALTER TABLE "episode_ratings" ADD CONSTRAINT "episode_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
