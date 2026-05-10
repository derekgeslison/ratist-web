-- CreateTable
CREATE TABLE "invite_code_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "old_code" TEXT,
    "new_code" TEXT,
    "admin_notes" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invite_code_requests_status_created_at_idx" ON "invite_code_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "invite_code_requests_user_id_status_idx" ON "invite_code_requests"("user_id", "status");

-- AddForeignKey
ALTER TABLE "invite_code_requests" ADD CONSTRAINT "invite_code_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code_requests" ADD CONSTRAINT "invite_code_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
