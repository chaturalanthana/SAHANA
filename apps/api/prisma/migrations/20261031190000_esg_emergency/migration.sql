-- Purpose: store ESG results from verified sources and keep prior results.
-- Tenant impact: both new tables are society-scoped. Emergency copy is unchanged.
-- Backfill: none.

CREATE TABLE esg_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  kpi_id uuid,
  measure text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  verified_total numeric(19,4) NOT NULL,
  unverified_count integer NOT NULL,
  source_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
CREATE INDEX esg_results_society ON esg_results (society_id, measure);

CREATE TABLE source_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (society_id, object_type, object_id)
);

GRANT SELECT, INSERT ON TABLE esg_results TO sahana_app;
GRANT SELECT, INSERT ON TABLE source_verifications TO sahana_app;
ALTER TABLE esg_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY esg_results_isolation ON esg_results
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);
CREATE POLICY source_verifications_isolation ON source_verifications
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);
REVOKE UPDATE, DELETE ON TABLE esg_results FROM sahana_app;
REVOKE UPDATE, DELETE ON TABLE source_verifications FROM sahana_app;
