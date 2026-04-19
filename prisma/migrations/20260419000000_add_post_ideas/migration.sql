-- CreateTable: post_ideas
CREATE TABLE "post_ideas" (
    "id" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "submitter_id" TEXT,
    "description" TEXT NOT NULL,
    "media_tmdb_id" INTEGER,
    "media_type" TEXT,
    "media_title" TEXT,
    "media_poster_path" TEXT,
    "person_tmdb_id" INTEGER,
    "person_name" TEXT,
    "person_profile_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "post_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_ideas_type_status_idx" ON "post_ideas"("type", "status");

-- AddForeignKey
ALTER TABLE "post_ideas" ADD CONSTRAINT "post_ideas_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "post_ideas" ADD CONSTRAINT "post_ideas_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
