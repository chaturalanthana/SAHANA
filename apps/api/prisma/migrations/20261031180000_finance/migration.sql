-- Purpose: store a simple-interest loan schedule. Interest is not a second ledger balance.
-- Tenant impact: loan_schedule_lines is society-scoped.
-- Backfill: none.

ALTER TABLE loan_product_versions ADD COLUMN published_at timestamptz;

CREATE TABLE loan_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  application_id uuid NOT NULL REFERENCES loan_applications(id),
  installment_no integer NOT NULL,
  due_on date NOT NULL,
  principal numeric(19,4) NOT NULL,
  interest numeric(19,4) NOT NULL,
  fee numeric(19,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'due',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, installment_no)
);

CREATE INDEX loan_schedule_lines_application ON loan_schedule_lines (society_id, application_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE loan_schedule_lines TO sahana_app;
ALTER TABLE loan_schedule_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_schedule_lines_isolation ON loan_schedule_lines
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);
