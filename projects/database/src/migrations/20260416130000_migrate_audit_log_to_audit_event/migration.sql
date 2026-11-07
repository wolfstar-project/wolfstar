-- Migrate legacy dashboard audit rows from audit_log into audit_event.
-- Environments that applied the original audit_log schema keep their history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "audit_event" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "audit_event_hash_key"      ON "audit_event"("hash");
CREATE INDEX IF NOT EXISTS "IDX_audit_event_action_timestamp" ON "audit_event"("action",    "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "IDX_audit_event_actor_timestamp"  ON "audit_event"("actor_id",  "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "IDX_audit_event_tenant_timestamp" ON "audit_event"("tenant_id", "timestamp" DESC);

CREATE TABLE IF NOT EXISTS "audit_chain_head" (
  "id"         TEXT         NOT NULL DEFAULT 'default',
  "hash"       VARCHAR(64)  NULL,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION audit_canonicalize(val jsonb) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text;
  key text;
  elem jsonb;
  first boolean;
BEGIN
  IF val IS NULL OR jsonb_typeof(val) = 'null' THEN
    RETURN 'null';
  END IF;

  CASE jsonb_typeof(val)
    WHEN 'string' THEN
      RETURN to_json(val #>> '{}')::text;
    WHEN 'number', 'boolean' THEN
      RETURN val::text;
    WHEN 'array' THEN
      result := '[';
      first := true;
      FOR elem IN SELECT value FROM jsonb_array_elements(val)
      LOOP
        IF NOT first THEN
          result := result || ',';
        END IF;
        result := result || audit_canonicalize(elem);
        first := false;
      END LOOP;
      RETURN result || ']';
    WHEN 'object' THEN
      result := '{';
      first := true;
      FOR key IN SELECT jsonb_object_keys(val) AS k ORDER BY k
      LOOP
        IF NOT first THEN
          result := result || ',';
        END IF;
        result := result || to_json(key)::text || ':' || audit_canonicalize(val -> key);
        first := false;
      END LOOP;
      RETURN result || '}';
    ELSE
      RETURN 'null';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION audit_hash_envelope(envelope jsonb) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(audit_canonicalize(envelope), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION audit_map_legacy_action(action text) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE action
    WHEN 'settings.update' THEN 'guild.settings.update'
    WHEN 'settings.add' THEN 'guild.settings.add'
    WHEN 'settings.remove' THEN 'guild.settings.remove'
    ELSE 'guild.settings.update'
  END;
$$;

CREATE OR REPLACE FUNCTION audit_transform_legacy_changes(changes jsonb) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'before',
    COALESCE(
      (
        SELECT jsonb_object_agg(elem ->> 'key', elem -> 'oldValue')
        FROM jsonb_array_elements(COALESCE(changes, '[]'::jsonb)) AS elem
        WHERE elem ? 'oldValue'
      ),
      '{}'::jsonb
    ),
    'after',
    COALESCE(
      (
        SELECT jsonb_object_agg(elem ->> 'key', elem -> 'newValue')
        FROM jsonb_array_elements(COALESCE(changes, '[]'::jsonb)) AS elem
        WHERE elem ? 'newValue'
      ),
      '{}'::jsonb
    )
  );
$$;

DO $$
DECLARE
  legacy_row record;
  mapped_action text;
  transformed_changes jsonb;
  timestamp_iso text;
  envelope jsonb;
  row_hash text;
  prev_hash text := NULL;
  migrated_count integer := 0;
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM audit_event LIMIT 1) THEN
    RAISE NOTICE 'audit_event already has rows; leaving audit_log untouched to avoid chain conflicts';
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(1096107084);

  FOR legacy_row IN
    SELECT id, guild_id, user_id, action, changes, created_at
    FROM audit_log
    ORDER BY created_at ASC, id ASC
  LOOP
    mapped_action := audit_map_legacy_action(legacy_row.action);
    transformed_changes := audit_transform_legacy_changes(legacy_row.changes::jsonb);
    timestamp_iso := to_char(legacy_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z';

    envelope := jsonb_build_object(
      'action', mapped_action,
      'actor', jsonb_build_object('id', legacy_row.user_id, 'type', 'user'),
      'changes', transformed_changes,
      'outcome', 'success',
      'prevHash', to_jsonb(prev_hash),
      'reason', NULL::jsonb,
      'requestId', NULL::jsonb,
      'tenantId', legacy_row.guild_id,
      'timestamp', timestamp_iso,
      'traceId', NULL::jsonb
    );

    row_hash := audit_hash_envelope(envelope);

    INSERT INTO audit_event (
      action,
      actor_type,
      actor_id,
      outcome,
      tenant_id,
      reason,
      timestamp,
      changes,
      prev_hash,
      hash
    ) VALUES (
      mapped_action,
      'user',
      legacy_row.user_id,
      'success',
      legacy_row.guild_id,
      NULL,
      legacy_row.created_at,
      transformed_changes,
      prev_hash,
      row_hash
    );

    prev_hash := row_hash;
    migrated_count := migrated_count + 1;
  END LOOP;

  IF migrated_count > 0 THEN
    INSERT INTO audit_chain_head (id, hash, updated_at)
    VALUES ('default', prev_hash, NOW())
    ON CONFLICT (id) DO UPDATE
      SET hash = EXCLUDED.hash,
          updated_at = EXCLUDED.updated_at;
  END IF;

  DROP TABLE audit_log;
END;
$$;

DROP FUNCTION IF EXISTS audit_hash_envelope(jsonb);
DROP FUNCTION IF EXISTS audit_transform_legacy_changes(jsonb);
DROP FUNCTION IF EXISTS audit_map_legacy_action(text);
DROP FUNCTION IF EXISTS audit_canonicalize(jsonb);
