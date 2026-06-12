-- Manually-managed partial indexes on Moderation — see migration 20260515000000_command_log_and_moderation_indexes.
-- Prisma cannot express partial indexes (WHERE createdAt IS NOT NULL) in DSL; do not add @@index here.

CREATE TABLE "command_log" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
  "guild_id"     VARCHAR(19)   NOT NULL,
  "user_id"      VARCHAR(19)   NOT NULL,
  "user_tag"     VARCHAR(37)   NULL,
  "command_name" VARCHAR(64)   NOT NULL,
  "subcommand"   VARCHAR(64)   NULL,
  "channel_id"   VARCHAR(19)   NULL,
  "success"      BOOLEAN       NOT NULL DEFAULT true,
  "error_reason" VARCHAR(2000) NULL,
  "executed_at"  TIMESTAMP(6)  NOT NULL,
  "latency_ms"   INTEGER       NULL,
  "metadata"     JSON          NULL,
  CONSTRAINT "command_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "command_log_guild_id_executed_at_idx"              ON "command_log"("guild_id", "executed_at" DESC);
CREATE INDEX "command_log_guild_id_user_id_executed_at_idx"      ON "command_log"("guild_id", "user_id", "executed_at");
CREATE INDEX "command_log_guild_id_command_name_executed_at_idx" ON "command_log"("guild_id", "command_name", "executed_at");
