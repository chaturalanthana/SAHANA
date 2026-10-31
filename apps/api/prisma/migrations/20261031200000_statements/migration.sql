-- Purpose: bank matching, budgets, asset records, and member dimension on journal lines.
-- Tenant impact: new tables are society-scoped. Existing journal lines gain a nullable member_id.
-- Backfill: none. Cash accounts 1000 and 1100 are marked when present.

ALTER TABLE accounts ADD COLUMN is_cash boolean NOT NULL DEFAULT false;
UPDATE accounts SET is_cash = true WHERE code IN ('1000', '1100');
ALTER TABLE journal_lines ADD COLUMN member_id uuid;

CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX bank_accounts_society ON bank_accounts (society_id);

CREATE TABLE bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  booked_on date NOT NULL,
  amount numeric(19,4) NOT NULL,
  description text NOT NULL,
  journal_line_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX bank_statement_lines_account ON bank_statement_lines (society_id, bank_account_id);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  period_id uuid NOT NULL REFERENCES fiscal_periods(id),
  amount numeric(19,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX budgets_society ON budgets (society_id, period_id);

CREATE TABLE fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  cost numeric(19,4) NOT NULL,
  acquired_on date NOT NULL,
  useful_life_years integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX fixed_assets_society ON fixed_assets (society_id);

CREATE TABLE investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  name text NOT NULL,
  cost numeric(19,4) NOT NULL,
  acquired_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX investments_society ON investments (society_id);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bank_accounts', 'bank_statement_lines', 'budgets', 'fixed_assets', 'investments']
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

CREATE OR REPLACE FUNCTION app_reverse_journal(p_document_id uuid, p_society_id uuid, p_actor uuid, p_reason text) RETURNS uuid
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
  INSERT INTO journal_lines (society_id, document_id, account_id, fund_id, member_id, debit, credit)
  SELECT society_id, v_new, account_id, fund_id, member_id, credit, debit
  FROM journal_lines WHERE document_id = p_document_id AND society_id = p_society_id;
  UPDATE journal_documents SET status = 'posted', posted_at = now(), posted_by = p_actor WHERE id = v_new;
  RETURN v_new;
END $$;
