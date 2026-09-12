-- AlterTable
ALTER TABLE "command_log" DROP COLUMN IF EXISTS "user_tag",
ADD COLUMN "command_type" VARCHAR(32),
ADD COLUMN "command_id" VARCHAR(19);
