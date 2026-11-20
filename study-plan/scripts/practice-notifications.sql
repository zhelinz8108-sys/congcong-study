-- The learning transaction also records the count. Only completed rounds are delivered.
CREATE TABLE IF NOT EXISTS dot_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id text NOT NULL, client_id text NOT NULL,
  redirect_uri text NOT NULL, challenge text NOT NULL, code_hash text UNIQUE, code_until timestamptz NOT NULL,
  access_hash text UNIQUE, access_until timestamptz, refresh_hash text UNIQUE, refresh_until timestamptz
);
CREATE TABLE IF NOT EXISTS dot_subscriptions (
  id text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES dot_grants ON DELETE CASCADE,
  callback text NOT NULL, secret text NOT NULL, previous_secret text, rotated_at timestamptz,
  verified_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS practice_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id text NOT NULL, activity text NOT NULL,
  session_key text NOT NULL, answered integer NOT NULL CHECK (answered > 0),
  due_at timestamptz NOT NULL, finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS practice_round_open ON practice_rounds (student_id, activity, session_key) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS practice_round_due ON practice_rounds (due_at) WHERE finished_at IS NULL;
CREATE TABLE IF NOT EXISTS dot_deliveries (
  round_id uuid NOT NULL REFERENCES practice_rounds ON DELETE CASCADE,
  subscription_id text NOT NULL REFERENCES dot_subscriptions ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS dot_delivery_due ON dot_deliveries (available_at);
CREATE OR REPLACE FUNCTION queue_dot_round() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dot_deliveries(round_id,subscription_id)
    SELECT NEW.id, s.id FROM dot_subscriptions s JOIN dot_grants g ON g.id=s.grant_id
    WHERE g.student_id=NEW.student_id AND s.expires_at>now() AND g.refresh_until>now()
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dot_round_completed ON practice_rounds;
CREATE TRIGGER dot_round_completed AFTER UPDATE OF finished_at ON practice_rounds
  FOR EACH ROW WHEN (OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL) EXECUTE FUNCTION queue_dot_round();
