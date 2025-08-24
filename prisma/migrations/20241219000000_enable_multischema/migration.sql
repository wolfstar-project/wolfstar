-- CreateSchemas
CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "moderation";
CREATE SCHEMA IF NOT EXISTS "system";

-- MigrateExistingTables
-- Move existing tables to their new schemas
ALTER TABLE "public"."guilds" SET SCHEMA "core";
ALTER TABLE "public"."user" SET SCHEMA "core";
ALTER TABLE "public"."moderation" SET SCHEMA "moderation";
ALTER TABLE "public"."migrations" SET SCHEMA "system";
ALTER TABLE "public"."schedule" SET SCHEMA "system";

-- Update sequences to new schemas
ALTER SEQUENCE "public"."migrations_id_seq" SET SCHEMA "system";
ALTER SEQUENCE "public"."schedule_id_seq" SET SCHEMA "system";