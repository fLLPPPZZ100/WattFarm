-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarId" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "unlockedAvatars" TEXT[] DEFAULT ARRAY['default']::TEXT[];
