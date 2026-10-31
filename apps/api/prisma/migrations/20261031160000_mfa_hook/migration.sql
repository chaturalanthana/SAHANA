-- Purpose: let the signed-in user store a TOTP factor reference without granting the app role a general users update.
-- Tenant impact: none. The function allows only the session user named by app.user_id.
-- Backfill: none.

CREATE FUNCTION app_set_mfa_factor(p_user_id uuid, p_factor text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')::uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_factor IS NULL OR length(p_factor) < 10 OR length(p_factor) > 200 THEN
    RAISE EXCEPTION 'validation';
  END IF;
  UPDATE users
  SET mfa_factor_ref = p_factor,
      updated_at = now(),
      updated_by = p_user_id
  WHERE id = p_user_id;
END $$;

CREATE FUNCTION app_mfa_factor(p_user_id uuid) RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mfa_factor_ref
  FROM users
  WHERE id = p_user_id
    AND id = NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION app_set_mfa_factor(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_mfa_factor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_set_mfa_factor(uuid, text) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_mfa_factor(uuid) TO sahana_app;
