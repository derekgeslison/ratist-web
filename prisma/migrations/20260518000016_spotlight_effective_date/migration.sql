-- AddColumn: policy banner targeting — only show to users whose
-- account was created before this timestamp. null = no cutoff.
ALTER TABLE "site_spotlights" ADD COLUMN "effective_for_users_before" TIMESTAMP(3);
