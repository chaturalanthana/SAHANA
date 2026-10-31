-- Purpose: store Milestone 1–5 records. Rule bodies are not interpreted.
-- Tenant impact: row-level security on every new tenant table.
-- Money columns use numeric(19,4) as storage only. TD-06 is still proposed.
-- No backfill and no sample benefit, interest, or ESG number.
-- Rollback: forward-fix only after an environment has data.

CREATE TABLE lookup_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  list_code text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, list_code, code)
);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  user_id uuid REFERENCES users(id),
  member_no text NOT NULL,
  given_name text NOT NULL,
  family_name text NOT NULL,
  employee_no text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  status_code text NOT NULL,
  category_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (society_id, member_no)
);
CREATE UNIQUE INDEX members_society_user ON members (society_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX members_directory ON members (society_id, family_name, given_name);

CREATE TABLE member_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  status_code text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  given_name text NOT NULL,
  family_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE member_family_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  family_member_id uuid NOT NULL REFERENCES family_members(id),
  relationship_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, member_id, family_member_id)
);

CREATE TABLE committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE committee_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  committee_id uuid NOT NULL REFERENCES committees(id),
  member_id uuid NOT NULL REFERENCES members(id),
  role_title text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  committee_id uuid NOT NULL REFERENCES committees(id),
  title text NOT NULL,
  held_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  meeting_id uuid NOT NULL REFERENCES meetings(id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE governance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  title text NOT NULL,
  language text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE welfare_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE welfare_scheme_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  scheme_id uuid NOT NULL REFERENCES welfare_schemes(id),
  version_no integer NOT NULL,
  rule_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (scheme_id, version_no)
);
COMMENT ON COLUMN welfare_scheme_versions.rule_body IS 'Uninterpreted until OD 02. Empty is not eligible.';

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  family_member_id uuid REFERENCES family_members(id),
  scheme_version_id uuid NOT NULL REFERENCES welfare_scheme_versions(id),
  idempotency_key text NOT NULL,
  eligibility_status text NOT NULL DEFAULT 'not_calculated' CHECK (eligibility_status = 'not_calculated'),
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, idempotency_key)
);

CREATE TABLE claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  claim_id uuid NOT NULL REFERENCES claims(id),
  event_type text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE approval_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  policy_status text NOT NULL DEFAULT 'stored_not_in_force' CHECK (policy_status = 'stored_not_in_force'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE approval_route_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  route_id uuid NOT NULL REFERENCES approval_routes(id),
  stage_no integer NOT NULL CHECK (stage_no BETWEEN 1 AND 3),
  role_code text NOT NULL,
  amount_note text,
  UNIQUE (route_id, stage_no)
);
COMMENT ON COLUMN approval_route_stages.amount_note IS 'Stored text only. OD 04 thresholds are not applied.';

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  route_id uuid REFERENCES approval_routes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  request_id uuid NOT NULL REFERENCES approval_requests(id),
  stage_no integer NOT NULL CHECK (stage_no BETWEEN 1 AND 3),
  decision text NOT NULL CHECK (decision IN ('approve', 'reject', 'return')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, code)
);

CREATE TABLE funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE journal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  period_id uuid NOT NULL REFERENCES fiscal_periods(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  reason text NOT NULL,
  reverses_document_id uuid REFERENCES journal_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  posted_at timestamptz,
  posted_by uuid
);

CREATE TABLE journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  document_id uuid NOT NULL REFERENCES journal_documents(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  fund_id uuid REFERENCES funds(id),
  debit numeric(19,4) NOT NULL DEFAULT 0,
  credit numeric(19,4) NOT NULL DEFAULT 0,
  CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0) AND (debit > 0 OR credit > 0))
);

CREATE TABLE loan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE loan_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  product_id uuid NOT NULL REFERENCES loan_products(id),
  version_no integer NOT NULL,
  rule_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (product_id, version_no)
);
COMMENT ON COLUMN loan_product_versions.rule_body IS 'Uninterpreted until OD 03. Empty is not zero interest.';

CREATE TABLE loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  product_version_id uuid NOT NULL REFERENCES loan_product_versions(id),
  status text NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  category text NOT NULL,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE project_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  member_id uuid NOT NULL REFERENCES members(id),
  family_member_id uuid REFERENCES family_members(id)
);

CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open'
);

CREATE TABLE project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  description text NOT NULL,
  amount numeric(19,4) NOT NULL,
  journal_document_id uuid REFERENCES journal_documents(id)
);

CREATE TABLE suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'declined', 'later')),
  project_id uuid REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE suggestion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  suggestion_id uuid NOT NULL REFERENCES suggestions(id),
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid NOT NULL REFERENCES members(id),
  request_type text NOT NULL,
  phone text NOT NULL,
  description text NOT NULL,
  idempotency_key text NOT NULL,
  location_permitted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, idempotency_key)
);

CREATE TABLE emergency_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  request_id uuid NOT NULL REFERENCES emergency_requests(id),
  note text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE esg_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE esg_kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  goal_id uuid NOT NULL REFERENCES esg_goals(id),
  name text NOT NULL,
  unit_label text NOT NULL,
  formula_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
COMMENT ON COLUMN esg_kpi_definitions.formula_body IS 'Uninterpreted until OD 05. Empty is not a verified result.';

CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  code text NOT NULL,
  language text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, code, language)
);

CREATE TABLE file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  storage_key text NOT NULL,
  media_type text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX lookup_values_society ON lookup_values (society_id, list_code);
CREATE INDEX member_status_history_member ON member_status_history (society_id, member_id, created_at);
CREATE INDEX family_members_society ON family_members (society_id);
CREATE INDEX member_family_links_society ON member_family_links (society_id);
CREATE INDEX committees_society ON committees (society_id);
CREATE INDEX committee_appointments_society ON committee_appointments (society_id);
CREATE INDEX meetings_society ON meetings (society_id);
CREATE INDEX resolutions_society ON resolutions (society_id);
CREATE INDEX governance_documents_society ON governance_documents (society_id);
CREATE INDEX welfare_schemes_society ON welfare_schemes (society_id);
CREATE INDEX welfare_scheme_versions_society ON welfare_scheme_versions (society_id);
CREATE INDEX claims_society ON claims (society_id, created_at);
CREATE INDEX claim_events_claim ON claim_events (society_id, claim_id);
CREATE INDEX approval_routes_society ON approval_routes (society_id);
CREATE INDEX approval_route_stages_society ON approval_route_stages (society_id);
CREATE INDEX approval_requests_object ON approval_requests (society_id, object_type, object_id);
CREATE INDEX approval_decisions_request ON approval_decisions (society_id, request_id);
CREATE INDEX accounts_society ON accounts (society_id);
CREATE INDEX funds_society ON funds (society_id);
CREATE INDEX fiscal_periods_society ON fiscal_periods (society_id);
CREATE INDEX journal_documents_society ON journal_documents (society_id, status);
CREATE INDEX journal_lines_document ON journal_lines (society_id, document_id);
CREATE INDEX loan_products_society ON loan_products (society_id);
CREATE INDEX loan_product_versions_society ON loan_product_versions (society_id);
CREATE INDEX loan_applications_society ON loan_applications (society_id);
CREATE INDEX projects_society ON projects (society_id);
CREATE INDEX project_participants_project ON project_participants (society_id, project_id);
CREATE INDEX project_tasks_project ON project_tasks (society_id, project_id);
CREATE INDEX project_expenses_project ON project_expenses (society_id, project_id);
CREATE INDEX suggestions_society ON suggestions (society_id);
CREATE INDEX suggestion_events_suggestion ON suggestion_events (society_id, suggestion_id);
CREATE INDEX emergency_requests_society ON emergency_requests (society_id, created_at);
CREATE INDEX emergency_updates_request ON emergency_updates (society_id, request_id);
CREATE INDEX esg_goals_society ON esg_goals (society_id);
CREATE INDEX esg_kpi_definitions_goal ON esg_kpi_definitions (society_id, goal_id);
CREATE INDEX notification_templates_society ON notification_templates (society_id);
CREATE INDEX file_objects_target ON file_objects (society_id, object_type, object_id);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'lookup_values', 'members', 'member_status_history', 'family_members', 'member_family_links',
    'committees', 'committee_appointments', 'meetings', 'resolutions', 'governance_documents',
    'welfare_schemes', 'welfare_scheme_versions', 'claims', 'claim_events',
    'approval_routes', 'approval_route_stages', 'approval_requests', 'approval_decisions',
    'accounts', 'funds', 'fiscal_periods', 'journal_documents', 'journal_lines',
    'loan_products', 'loan_product_versions', 'loan_applications',
    'projects', 'project_participants', 'project_tasks', 'project_expenses',
    'suggestions', 'suggestion_events', 'emergency_requests', 'emergency_updates',
    'esg_goals', 'esg_kpi_definitions', 'notification_templates', 'file_objects'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO sahana_app', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (society_id = NULLIF(current_setting(''app.society_id'', true), '''')::uuid) WITH CHECK (society_id = NULLIF(current_setting(''app.society_id'', true), '''')::uuid)',
      table_name || '_isolation',
      table_name
    );
  END LOOP;
END $$;

REVOKE UPDATE, DELETE ON TABLE member_status_history FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE welfare_scheme_versions FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE claim_events FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE approval_decisions FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE suggestion_events FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE emergency_updates FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE journal_lines FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE journal_documents FROM sahana_app;
REVOKE UPDATE ON TABLE suggestions FROM sahana_app;
GRANT UPDATE (status, project_id) ON TABLE suggestions TO sahana_app;

CREATE FUNCTION reject_journal_line_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'posted_immutable';
END $$;

CREATE TRIGGER journal_lines_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION reject_journal_line_change();

CREATE FUNCTION reject_line_on_closed_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM journal_documents WHERE id = NEW.document_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'posted_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER journal_lines_draft_only
  BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION reject_line_on_closed_document();

CREATE FUNCTION guard_journal_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'posted_immutable';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'posted'
     AND NEW.society_id = OLD.society_id
     AND NEW.period_id = OLD.period_id
     AND NEW.reason = OLD.reason
     AND NEW.reverses_document_id IS NOT DISTINCT FROM OLD.reverses_document_id
     AND NEW.created_by = OLD.created_by THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'posted_immutable';
END $$;

CREATE TRIGGER journal_documents_guard
  BEFORE UPDATE OR DELETE ON journal_documents
  FOR EACH ROW EXECUTE FUNCTION guard_journal_document();

CREATE FUNCTION reject_suggestion_body_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.society_id IS DISTINCT FROM OLD.society_id THEN
    RAISE EXCEPTION 'suggestion_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER suggestions_keep_body
  BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION reject_suggestion_body_change();

CREATE FUNCTION app_post_journal(p_document_id uuid, p_society_id uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_period text;
  v_debit numeric(19,4);
  v_credit numeric(19,4);
BEGIN
  IF p_society_id IS DISTINCT FROM NULLIF(current_setting('app.society_id', true), '')::uuid THEN
    RAISE EXCEPTION 'society_mismatch';
  END IF;
  SELECT d.status, p.status INTO v_status, v_period
  FROM journal_documents d
  JOIN fiscal_periods p ON p.id = d.period_id
  WHERE d.id = p_document_id AND d.society_id = p_society_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_period = 'closed' THEN
    RAISE EXCEPTION 'period_closed';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'not_draft';
  END IF;
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_debit, v_credit
  FROM journal_lines WHERE document_id = p_document_id AND society_id = p_society_id;
  IF v_debit <> v_credit OR v_debit = 0 THEN
    RAISE EXCEPTION 'unbalanced';
  END IF;
  UPDATE journal_documents
  SET status = 'posted', posted_at = now(), posted_by = p_actor
  WHERE id = p_document_id;
END $$;

CREATE FUNCTION app_reverse_journal(p_document_id uuid, p_society_id uuid, p_actor uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_period uuid;
  v_new uuid;
BEGIN
  IF p_society_id IS DISTINCT FROM NULLIF(current_setting('app.society_id', true), '')::uuid THEN
    RAISE EXCEPTION 'society_mismatch';
  END IF;
  SELECT status, period_id INTO v_status, v_period
  FROM journal_documents WHERE id = p_document_id AND society_id = p_society_id;
  IF v_status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'not_posted';
  END IF;
  INSERT INTO journal_documents (society_id, period_id, status, reason, reverses_document_id, created_by)
  VALUES (p_society_id, v_period, 'draft', p_reason, p_document_id, p_actor)
  RETURNING id INTO v_new;
  INSERT INTO journal_lines (society_id, document_id, account_id, fund_id, debit, credit)
  SELECT society_id, v_new, account_id, fund_id, credit, debit
  FROM journal_lines WHERE document_id = p_document_id AND society_id = p_society_id;
  UPDATE journal_documents SET status = 'posted', posted_at = now(), posted_by = p_actor WHERE id = v_new;
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION app_post_journal(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_reverse_journal(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_post_journal(uuid, uuid, uuid) TO sahana_app;
GRANT EXECUTE ON FUNCTION app_reverse_journal(uuid, uuid, uuid, text) TO sahana_app;
