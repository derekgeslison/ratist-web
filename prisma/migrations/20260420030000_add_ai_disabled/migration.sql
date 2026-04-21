-- AlterTable: add ai_disabled flag to users
ALTER TABLE "users" ADD COLUMN "ai_disabled" BOOLEAN NOT NULL DEFAULT false;
