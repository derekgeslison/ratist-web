-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('BLOG', 'PUNCH_AND_JUDY', 'MOVIE_MAP');

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "type" "PostType" NOT NULL DEFAULT 'BLOG';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false;
