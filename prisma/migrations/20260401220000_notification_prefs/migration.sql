-- Add link field to notifications
ALTER TABLE "notifications" ADD COLUMN "link" TEXT;

-- Add dedup index for notification cooldown checks
CREATE INDEX "notifications_user_id_type_target_type_target_id_idx" ON "notifications"("user_id", "type", "target_type", "target_id");

-- Add notification_prefs to users
ALTER TABLE "users" ADD COLUMN "notification_prefs" JSONB NOT NULL DEFAULT '{"commentOnContent":true,"likeOnContent":true,"commentReplies":true,"commentLikes":true,"milestones":true,"watchlistInvites":true}';
