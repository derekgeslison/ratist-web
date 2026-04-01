-- CreateTable: watchlists
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: watchlist_movies
CREATE TABLE "watchlist_movies" (
    "id" TEXT NOT NULL,
    "watchlist_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3),
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: watchlist_collaborators
CREATE TABLE "watchlist_collaborators" (
    "watchlist_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_collaborators_pkey" PRIMARY KEY ("watchlist_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_user_id_slug_key" ON "watchlists"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_movies_watchlist_id_movie_id_key" ON "watchlist_movies"("watchlist_id", "movie_id");

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_movies" ADD CONSTRAINT "watchlist_movies_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_movies" ADD CONSTRAINT "watchlist_movies_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_collaborators" ADD CONSTRAINT "watchlist_collaborators_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_collaborators" ADD CONSTRAINT "watchlist_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: create a default watchlist for each user with watchlist entries, then copy entries
INSERT INTO "watchlists" ("id", "user_id", "name", "slug", "is_default", "updated_at")
SELECT
    'wl_default_' || u.user_id,
    u.user_id,
    'Watchlist',
    'watchlist',
    true,
    NOW()
FROM (SELECT DISTINCT user_id FROM "user_watchlist_movies") u;

INSERT INTO "watchlist_movies" ("id", "watchlist_id", "movie_id", "added_at")
SELECT
    'wlm_' || uwm.user_id || '_' || uwm.movie_id,
    'wl_default_' || uwm.user_id,
    uwm.movie_id,
    uwm.created_at
FROM "user_watchlist_movies" uwm;

-- Drop old table
ALTER TABLE "user_watchlist_movies" DROP CONSTRAINT "user_watchlist_movies_user_id_fkey";
ALTER TABLE "user_watchlist_movies" DROP CONSTRAINT "user_watchlist_movies_movie_id_fkey";
DROP TABLE "user_watchlist_movies";
