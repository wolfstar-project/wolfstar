-- AlterTable
ALTER TABLE "guilds" ADD COLUMN "channels.logs.command" VARCHAR(19);
ALTER TABLE "guilds" ADD COLUMN "channels.logs.settings" VARCHAR(19);
