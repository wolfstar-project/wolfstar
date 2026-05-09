DROP TABLE IF EXISTS "audit_log" CASCADE;

CREATE TABLE "audit_event" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "action"      VARCHAR(64)  NOT NULL,
  "actor_type"  VARCHAR(32)  NOT NULL,
  "actor_id"    TEXT         NOT NULL,
  "actor_name"  TEXT         NULL,
  "target_type" VARCHAR(32)  NULL,
  "target_id"   TEXT         NULL,
  "outcome"     VARCHAR(32)  NOT NULL,
  "tenant_id"   TEXT         NULL,
  "reason"      VARCHAR(500) NULL,
  "timestamp"   TIMESTAMP(6) NOT NULL,
  "changes"     JSON         NULL,
  "context"     JSON         NULL,
  "prev_hash"   VARCHAR(64)  NULL,
  "hash"        VARCHAR(64)  NOT NULL,
  CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_event_hash_key"            ON "audit_event"("hash");
CREATE INDEX "IDX_audit_event_action_timestamp"       ON "audit_event"("action",    "timestamp" DESC);
CREATE INDEX "IDX_audit_event_actor_timestamp"        ON "audit_event"("actor_id",  "timestamp" DESC);
CREATE INDEX "IDX_audit_event_tenant_timestamp"       ON "audit_event"("tenant_id", "timestamp" DESC);

CREATE TABLE "audit_chain_head" (
  "id"         TEXT         NOT NULL DEFAULT 'default',
  "hash"       VARCHAR(64)  NULL,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("id")
);
