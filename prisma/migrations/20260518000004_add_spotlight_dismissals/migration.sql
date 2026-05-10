-- CreateTable
CREATE TABLE "spotlight_dismissals" (
    "user_id" TEXT NOT NULL,
    "spotlight_id" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotlight_dismissals_pkey" PRIMARY KEY ("user_id", "spotlight_id")
);

-- CreateIndex
CREATE INDEX "spotlight_dismissals_user_id_idx" ON "spotlight_dismissals"("user_id");

-- AddForeignKey
ALTER TABLE "spotlight_dismissals" ADD CONSTRAINT "spotlight_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_dismissals" ADD CONSTRAINT "spotlight_dismissals_spotlight_id_fkey" FOREIGN KEY ("spotlight_id") REFERENCES "site_spotlights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
