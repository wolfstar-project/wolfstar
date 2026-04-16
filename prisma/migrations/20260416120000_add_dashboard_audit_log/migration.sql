CREATE TABLE "audit_log" (
  "id" SERIAL NOT NULL,
  "guild_id" VARCHAR(19) NOT NULL,
  "user_id" VARCHAR(19) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "section" VARCHAR(64) NOT NULL,
  "changes" JSON NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IDX_audit_log_guild_created" ON "audit_log"("guild_id", "created_at" DESC);
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
