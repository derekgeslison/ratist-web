-- CreateTable
CREATE TABLE "marquee_brief_cache" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marquee_brief_cache_pkey" PRIMARY KEY ("id")
);
