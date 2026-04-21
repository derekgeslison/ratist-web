-- CreateTable: movie_parents_guides
CREATE TABLE "movie_parents_guides" (
    "tmdb_id" INTEGER NOT NULL,
    "violence_severity" TEXT NOT NULL,
    "sexual_severity" TEXT NOT NULL,
    "language_substance_severity" TEXT NOT NULL,
    "scary_intense_severity" TEXT NOT NULL,
    "sensitive_themes_severity" TEXT NOT NULL,
    "total_voters" INTEGER NOT NULL DEFAULT 0,
    "limited_data" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movie_parents_guides_pkey" PRIMARY KEY ("tmdb_id")
);
