-- Purpose: society isolation for Milestone 0 (TD-01).
-- Tenant impact: enables row-level security and a non-login application role.
-- No backfill. The application role has no password and is used only with SET ROLE.
-- Rollback: forward-fix only after an environment has data.

ALTER TABLE sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sahana_app') THEN
    CREATE ROLE sahana_app NOLOGIN;
  END IF;
END $$;

GRANT sahana_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO sahana_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sahana_app;

REVOKE ALL ON TABLE sessions FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE audit_events FROM sahana_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE permissions FROM sahana_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE config_definitions FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE config_versions FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE consent_acceptances FROM sahana_app;
REVOKE ALL ON TABLE users FROM sahana_app;

GRANT SELECT (
  id, email, display_name, status, preferred_language, mfa_factor_ref,
  created_at, created_by, updated_at, updated_by
) ON TABLE users TO sahana_app;
GRANT UPDATE (preferred_language, updated_at, updated_by) ON TABLE users TO sahana_app;

ALTER TABLE societies ENABLE ROW LEVEL SECURITY;
ALTER TABLE society_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE society_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY societies_isolation ON societies
  FOR ALL
  USING (id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY society_users_isolation ON society_users
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY roles_isolation ON roles
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY role_permissions_isolation ON role_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND r.society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_permissions.role_id
        AND r.society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    )
  );

CREATE POLICY society_user_roles_isolation ON society_user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM society_users su
      WHERE su.id = society_user_roles.society_user_id
        AND su.society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM society_users su
      WHERE su.id = society_user_roles.society_user_id
        AND su.society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    )
  );

CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM society_users su
      WHERE su.user_id = users.id
        AND su.society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    )
  );

CREATE POLICY users_update_self ON users
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY sessions_actor ON sessions
  FOR SELECT
  USING (
    society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY audit_isolation ON audit_events
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY config_versions_isolation ON config_versions
  FOR ALL
  USING (
    society_id = NULLIF(current_setting('app.society_id', true), '')::uuid
    OR (society_id IS NULL AND definition_key = 'environmentLabel')
  )
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY consent_documents_isolation ON consent_documents
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE POLICY consent_acceptances_isolation ON consent_acceptances
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION app_auth_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  password_hash text,
  display_name text,
  status text,
  preferred_language text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.password_hash, u.display_name, u.status, u.preferred_language
  FROM users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_memberships_for_user(p_user_id uuid)
RETURNS TABLE (society_id uuid, society_name text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.society_id, s.name, su.status
  FROM society_users su
  JOIN societies s ON s.id = su.society_id
  WHERE su.user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION app_create_session(
  p_user_id uuid,
  p_society_id uuid,
  p_token_hash text,
  p_client_kind text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM society_users
    WHERE user_id = p_user_id AND society_id = p_society_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'membership_required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO sessions (user_id, society_id, token_hash, client_kind, expires_at, created_by)
  VALUES (p_user_id, p_society_id, p_token_hash, p_client_kind, p_expires_at, p_user_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_session_by_token_hash(p_token_hash text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  society_id uuid,
  client_kind text,
  expires_at timestamptz,
  revoked_at timestamptz,
  user_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.society_id, s.client_kind, s.expires_at, s.revoked_at, u.status
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
$$;

CREATE OR REPLACE FUNCTION app_session_by_id(p_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  society_id uuid,
  client_kind text,
  expires_at timestamptz,
  revoked_at timestamptz,
  user_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.society_id, s.client_kind, s.expires_at, s.revoked_at, u.status
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = p_id
$$;

CREATE OR REPLACE FUNCTION app_revoke_session(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sessions SET revoked_at = now() WHERE id = p_id AND revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION app_platform_config(p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value #>> '{}'
  FROM config_versions
  WHERE society_id IS NULL
    AND definition_key = p_key
    AND status = 'active'
    AND p_key IN ('environmentLabel', 'auth.loginRateLimit')
  ORDER BY effective_from DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_audit_login_failure(p_email text, p_trace_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_events (society_id, actor_id, action, object_type, object_id, trace_id, detail)
  VALUES (NULL, NULL, 'auth.login_failed', 'user', NULL, p_trace_id, jsonb_build_object('email', p_email));
$$;

REVOKE ALL ON FUNCTION app_auth_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_memberships_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_create_session(uuid, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_session_by_token_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_session_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_revoke_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_platform_config(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_audit_login_failure(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_auth_user_by_email(text) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_memberships_for_user(uuid) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_create_session(uuid, uuid, text, text, timestamptz) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_session_by_token_hash(text) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_session_by_id(uuid) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_revoke_session(uuid) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_platform_config(text) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_audit_login_failure(text, text) TO sahana_app;
