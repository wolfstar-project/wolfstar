DROP TABLE IF EXISTS "audit_log" CASCADE;

CREATE TABLE "audit_event" (
  "hash"               VARCHAR(64)  NOT NULL,
  "prev_hash"          VARCHAR(64)  NULL,
  "tenant_id"          VARCHAR(19)  NOT NULL,
  "actor_id"           VARCHAR(19)  NOT NULL,
  "actor_display_name" VARCHAR(64)  NULL,
  "action"             VARCHAR(64)  NOT NULL,
  "outcome"            VARCHAR(16)  NOT NULL,
  "reason"             VARCHAR(2000) NULL,
  "changes"            JSON         NULL,
  "timestamp"          TIMESTAMP(6) NOT NULL,
  "request_id"         VARCHAR(64)  NULL,
  "trace_id"           VARCHAR(64)  NULL,
  CONSTRAINT "audit_event_pkey" PRIMARY KEY ("hash")
);

CREATE INDEX "IDX_audit_event_action_timestamp"   ON "audit_event"("action",    "timestamp" DESC);
CREATE INDEX "IDX_audit_event_actor_timestamp"    ON "audit_event"("actor_id",  "timestamp" DESC);
CREATE INDEX "IDX_audit_event_tenant_timestamp"   ON "audit_event"("tenant_id", "timestamp" DESC);

CREATE TABLE "audit_chain_head" (
  "tenant_id"     VARCHAR(19)  NOT NULL,
  "last_hash"     VARCHAR(64)  NOT NULL,
  "last_sequence" BIGINT       NOT NULL DEFAULT 0,
  "updated_at"    TIMESTAMP(6) NOT NULL,
  CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("tenant_id")
);
