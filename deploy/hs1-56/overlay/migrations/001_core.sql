CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS secrets (
 hash text PRIMARY KEY, kind text NOT NULL, user_id uuid REFERENCES users(id),
 data jsonb NOT NULL DEFAULT '{}', expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS secrets_expiry ON secrets(expires_at);
CREATE TABLE IF NOT EXISTS oauth_clients (
 id text PRIMARY KEY, name text NOT NULL, redirects jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS grants (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), client_id text NOT NULL REFERENCES oauth_clients(id),
 app text NOT NULL, scopes jsonb NOT NULL, revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, client_id, app)
);
CREATE TABLE IF NOT EXISTS calls (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), grant_id uuid REFERENCES grants(id),
 app text NOT NULL, tool text NOT NULL, document_id text, editor_id text,
 status text NOT NULL, error_code text, duration_ms integer, idempotency_key text, fingerprint text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(user_id, app, editor_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS calls_owner_time ON calls(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS audit (
 id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), event text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotas (
 key text PRIMARY KEY, window_start bigint NOT NULL, count integer NOT NULL
);
CREATE TABLE IF NOT EXISTS used_refresh (
 hash text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES grants(id), expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_accounts (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_accounts(id),
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_audit (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_accounts(id),
 event text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cloud_folders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 parent_id uuid REFERENCES cloud_folders(id), name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cloud_documents (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 folder_id uuid REFERENCES cloud_folders(id), name text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'baizefig';

CREATE TABLE IF NOT EXISTS cloud_document_versions (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES cloud_documents(id),
 content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS head_id uuid;
ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS preview jsonb NOT NULL DEFAULT '[]';

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 5242880 CHECK (storage_limit_bytes >= 0);

ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE cloud_documents d SET created_at=COALESCE((SELECT min(created_at) FROM cloud_document_versions WHERE document_id=d.id),d.updated_at) WHERE d.created_at IS NULL;
ALTER TABLE cloud_documents ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE cloud_folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cloud_folders ADD COLUMN IF NOT EXISTS trash_root uuid;
ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS trash_root uuid;

CREATE TABLE IF NOT EXISTS cloud_purge_archive (
 id bigserial PRIMARY KEY,
 entity_type text NOT NULL CHECK (entity_type IN ('file','folder')),
 entity_id uuid NOT NULL,
 user_id uuid NOT NULL,
 payload jsonb NOT NULL,
 purged_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '180 days')
);
CREATE INDEX IF NOT EXISTS cloud_purge_archive_expiry ON cloud_purge_archive(expires_at);

ALTER TABLE cloud_folders ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE cloud_folders SET updated_at=created_at WHERE updated_at IS NULL;
ALTER TABLE cloud_folders ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS version_name text;
CREATE TABLE IF NOT EXISTS cloud_restore_counters (
 user_id uuid NOT NULL REFERENCES users(id), document_id uuid NOT NULL,
 day text NOT NULL, sequence bigint NOT NULL,
 PRIMARY KEY(user_id,document_id,day)
);

CREATE TABLE IF NOT EXISTS app_connections (
 user_id uuid NOT NULL REFERENCES users(id), editor_id text NOT NULL,
 app text NOT NULL, session_hash text NOT NULL, origin text NOT NULL,
 name text NOT NULL, platform text NOT NULL, document_id text NOT NULL,
 disabled boolean NOT NULL DEFAULT false, last_seen timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,editor_id)
);
CREATE TABLE IF NOT EXISTS document_edit_locks (
 user_id uuid NOT NULL REFERENCES users(id), document_id text NOT NULL,
 token uuid NOT NULL, editor_id text NOT NULL, session_hash text NOT NULL,
 grant_id uuid REFERENCES grants(id), label text NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(user_id,document_id)
);
ALTER TABLE grants ADD COLUMN IF NOT EXISTS document_ids jsonb;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS connection_ids jsonb;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS authorized_scopes jsonb;
UPDATE grants SET authorized_scopes=scopes WHERE authorized_scopes IS NULL;

ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS autosave_lock_token uuid;

CREATE TABLE IF NOT EXISTS cloud_shared_objects (
 user_id uuid NOT NULL REFERENCES users(id), hash text NOT NULL,
 payload bytea NOT NULL, raw_bytes bigint NOT NULL, kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,hash)
);
CREATE TABLE IF NOT EXISTS cloud_shared_snapshots (
 user_id uuid NOT NULL REFERENCES users(id), hash text NOT NULL,
 manifest jsonb NOT NULL, logical_bytes bigint NOT NULL, preview_bytes bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,hash)
);
CREATE TABLE IF NOT EXISTS cloud_snapshot_objects (
 user_id uuid NOT NULL, snapshot_hash text NOT NULL, object_hash text NOT NULL,
 PRIMARY KEY(user_id,snapshot_hash,object_hash),
 FOREIGN KEY(user_id,snapshot_hash) REFERENCES cloud_shared_snapshots(user_id,hash) ON DELETE CASCADE,
 FOREIGN KEY(user_id,object_hash) REFERENCES cloud_shared_objects(user_id,hash)
);
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS snapshot_hash text;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS logical_bytes bigint;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS preview_bytes bigint;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS stage_id text;
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS parent_version_id uuid;
CREATE TABLE IF NOT EXISTS cloud_rolling_drafts (
 document_id uuid PRIMARY KEY REFERENCES cloud_documents(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), snapshot_hash text NOT NULL,
 base_head_id uuid, stage_base_id uuid, revision uuid NOT NULL,
 stage_id text NOT NULL, client_id text NOT NULL, sequence bigint NOT NULL,
 logical_bytes bigint NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cloud_rolling_archives (
 document_id uuid PRIMARY KEY REFERENCES cloud_documents(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), snapshot_hash text NOT NULL,
 base_head_id uuid, stage_id text NOT NULL, logical_bytes bigint NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cloud_snapshot_objects_object ON cloud_snapshot_objects(user_id,object_hash);
CREATE INDEX IF NOT EXISTS cloud_versions_snapshot ON cloud_document_versions(snapshot_hash) WHERE snapshot_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS cloud_drafts_user ON cloud_rolling_drafts(user_id);
CREATE INDEX IF NOT EXISTS cloud_archives_user ON cloud_rolling_archives(user_id);

ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS share_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS app_integrations (
 user_id uuid NOT NULL REFERENCES users(id), app text NOT NULL,
 connected_at timestamptz, last_login_at timestamptz,
 PRIMARY KEY(user_id,app)
);
INSERT INTO app_integrations(user_id,app) SELECT DISTINCT user_id,app FROM app_connections ON CONFLICT DO NOTHING;
INSERT INTO app_integrations(user_id,app) SELECT DISTINCT user_id,data->>'app' FROM secrets WHERE kind='editor' AND user_id IS NOT NULL AND data->>'app' IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE app_connections ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app_connections ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE app_connections ADD COLUMN IF NOT EXISTS connected_at timestamptz;
ALTER TABLE app_connections ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;
ALTER TABLE app_connections ADD COLUMN IF NOT EXISTS connection_instance_id uuid;
CREATE TABLE IF NOT EXISTS app_connection_events (
 id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), app text NOT NULL,
 event text NOT NULL, editor_id text, instance_id uuid, document_id text,
 previous_document_id text, origin text, platform text, reason text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_events_time ON app_connection_events(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS app_events_user_time ON app_connection_events(user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS secrets_owner_kind_expiry ON secrets(user_id,kind,expires_at);

CREATE TABLE IF NOT EXISTS heyso_requests (
 user_id uuid NOT NULL REFERENCES users(id), request_id text NOT NULL,
 document_id uuid NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
CREATE TABLE IF NOT EXISTS heyso_imports (
 user_id uuid NOT NULL REFERENCES users(id), document_id uuid NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, PRIMARY KEY(user_id,document_id)
);
CREATE TABLE IF NOT EXISTS heyso_mcp_heads (
 user_id uuid NOT NULL REFERENCES users(id), request_id text NOT NULL, head_id uuid NOT NULL,
 PRIMARY KEY(user_id,request_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS heyso_view_preferences (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
 view text NOT NULL CHECK(view IN ('roadmap','backlog','board','list','releases','reports')),
 state jsonb NOT NULL DEFAULT '{}', revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,document_id,view)
);

-- HeySO's mutable automatic checkpoint has a fixed window anchor. Its ID still
-- rotates on every write, independently of how many historical rows are kept.
ALTER TABLE cloud_document_versions ADD COLUMN IF NOT EXISTS heyso_window_start timestamptz;
CREATE INDEX IF NOT EXISTS cloud_versions_document ON cloud_document_versions(document_id);
CREATE TABLE IF NOT EXISTS heyso_compaction_jobs (
 version_id uuid PRIMARY KEY REFERENCES cloud_document_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS heyso_compaction_ready ON heyso_compaction_jobs(available_at);

ALTER TABLE cloud_documents ADD COLUMN IF NOT EXISTS heyso_live boolean NOT NULL DEFAULT false;
