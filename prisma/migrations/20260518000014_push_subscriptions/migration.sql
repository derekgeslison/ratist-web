-- AddColumn: push notification preferences mirror notification_prefs
ALTER TABLE "users" ADD COLUMN "push_prefs" JSONB NOT NULL DEFAULT '{"commentOnContent":true,"likeOnContent":true,"commentReplies":true,"commentLikes":true,"milestones":true,"watchlistInvites":true}'::jsonb;

-- CreateTable: one row per (user, device/browser) push subscription.
-- endpoint is the unique URL the push service issued; (p256dh, auth)
-- are the keys to encrypt push payloads end-to-end.
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
