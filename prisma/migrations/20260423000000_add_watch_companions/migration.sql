CREATE TABLE "watch_companions" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "media_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "runtime_seconds" INTEGER,
    "seasons_generated" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generated_by" TEXT,
    "last_generated_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_companions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_characters" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actor_name" TEXT,
    "actor_tmdb_id" INTEGER,
    "base_description" TEXT NOT NULL,
    "visible_after" JSONB NOT NULL,
    "group" TEXT,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "companion_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_facts" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "fact_type" TEXT NOT NULL,
    "visible_after" JSONB NOT NULL,

    CONSTRAINT "companion_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_relationships" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "from_character_id" TEXT NOT NULL,
    "to_character_id" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "visible_after" JSONB NOT NULL,
    "directed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "companion_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_timeline_events" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visible_after" JSONB NOT NULL,
    "character_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importance" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "companion_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_glossary_terms" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "visible_after" JSONB NOT NULL,
    "category" TEXT,

    CONSTRAINT "companion_glossary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_suggestions" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "submitter_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "rationale" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "upvote_score" INTEGER NOT NULL DEFAULT 0,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companion_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_suggestion_votes" (
    "id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_suggestion_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex
CREATE INDEX "watch_companions_status_idx" ON "watch_companions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "watch_companions_tmdb_id_media_type_key" ON "watch_companions"("tmdb_id", "media_type");

-- CreateIndex
CREATE INDEX "companion_characters_companion_id_idx" ON "companion_characters"("companion_id");

-- CreateIndex
CREATE INDEX "companion_facts_character_id_idx" ON "companion_facts"("character_id");

-- CreateIndex
CREATE INDEX "companion_relationships_companion_id_idx" ON "companion_relationships"("companion_id");

-- CreateIndex
CREATE INDEX "companion_timeline_events_companion_id_idx" ON "companion_timeline_events"("companion_id");

-- CreateIndex
CREATE INDEX "companion_glossary_terms_companion_id_idx" ON "companion_glossary_terms"("companion_id");

-- CreateIndex
CREATE INDEX "companion_suggestions_companion_id_status_idx" ON "companion_suggestions"("companion_id", "status");

-- CreateIndex
CREATE INDEX "companion_suggestions_status_created_at_idx" ON "companion_suggestions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "companion_suggestion_votes_suggestion_id_voter_id_key" ON "companion_suggestion_votes"("suggestion_id", "voter_id");

-- AddForeignKey
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "companion_characters" ADD CONSTRAINT "companion_characters_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_facts" ADD CONSTRAINT "companion_facts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "companion_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_relationships" ADD CONSTRAINT "companion_relationships_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_relationships" ADD CONSTRAINT "companion_relationships_from_character_id_fkey" FOREIGN KEY ("from_character_id") REFERENCES "companion_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_relationships" ADD CONSTRAINT "companion_relationships_to_character_id_fkey" FOREIGN KEY ("to_character_id") REFERENCES "companion_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_timeline_events" ADD CONSTRAINT "companion_timeline_events_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_glossary_terms" ADD CONSTRAINT "companion_glossary_terms_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_suggestions" ADD CONSTRAINT "companion_suggestions_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "watch_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_suggestions" ADD CONSTRAINT "companion_suggestions_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_suggestions" ADD CONSTRAINT "companion_suggestions_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "companion_suggestion_votes" ADD CONSTRAINT "companion_suggestion_votes_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "companion_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "companion_suggestion_votes" ADD CONSTRAINT "companion_suggestion_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
