-- Purpose: store a published welfare rule and the eligibility result taken at claim time.
-- Tenant impact: notification_deliveries is society-scoped. Existing scheme versions stay unpublished.
-- Backfill: none.

ALTER TABLE claims DROP CONSTRAINT claims_eligibility_status_check;
ALTER TABLE claims ADD CONSTRAINT claims_eligibility_status_check
  CHECK (eligibility_status IN ('not_calculated', 'eligible', 'ineligible'));

ALTER TABLE welfare_scheme_versions ADD COLUMN published_at timestamptz;
ALTER TABLE claims ADD COLUMN amount numeric(19,4);
ALTER TABLE claims ADD COLUMN eligibility_reason text NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN evidence_note text NOT NULL DEFAULT '';
ALTER TABLE approval_routes ADD COLUMN allow_self_approval boolean NOT NULL DEFAULT false;
ALTER TABLE approval_routes DROP CONSTRAINT approval_routes_policy_status_check;
ALTER TABLE approval_routes ADD CONSTRAINT approval_routes_policy_status_check
  CHECK (policy_status IN ('stored_not_in_force', 'in_force'));
ALTER TABLE approval_routes ALTER COLUMN policy_status SET DEFAULT 'in_force';

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id),
  member_id uuid,
  channel text NOT NULL,
  status text NOT NULL,
  message_key text NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX notification_deliveries_society ON notification_deliveries (society_id, created_at);

GRANT SELECT, INSERT ON TABLE notification_deliveries TO sahana_app;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_deliveries_isolation ON notification_deliveries
  FOR ALL
  USING (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid)
  WITH CHECK (society_id = NULLIF(current_setting('app.society_id', true), '')::uuid);
REVOKE UPDATE, DELETE ON TABLE notification_deliveries FROM sahana_app;
