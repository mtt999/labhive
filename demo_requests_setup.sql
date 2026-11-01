-- demo_requests_setup.sql — LabHive only (the Demo Lab lives here). Idempotent.
--
-- "Request a demo" on labhive.app (Pricing → Team Plan). A visitor fills the
-- form while signed out; the super admin is told in the app AND by email,
-- then sends a personal login to the Demo Lab from Super Admin → Demo Requests.
--
-- The 15-day limit is back end only — visitors are never told it:
--   * the clock starts at their FIRST sign-in (demo_access_check(), called by
--     the app right after sign-in, stamps first_login_at / expires_at);
--   * after expires_at, sign-in shows "Your demo access has ended" and the
--     users row is switched off; the nightly job below does the same for
--     anyone who never comes back, so an open session cannot carry on.
-- The super admin can Extend (+7 days) or End now from the list.

CREATE TABLE IF NOT EXISTS demo_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 60),
  last_name      TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 60),
  org_type       TEXT NOT NULL CHECK (org_type IN ('University', 'Industry', 'Government')),
  email          TEXT NOT NULL CHECK (email ~* '^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$' AND length(email) <= 160),
  wants_meeting  BOOLEAN NOT NULL DEFAULT FALSE,
  explore_only   BOOLEAN,                      -- only asked when wants_meeting is false
  note           TEXT CHECK (length(note) <= 2000),
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent', 'declined', 'ended')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at        TIMESTAMPTZ,
  user_id        UUID,                         -- the demo users row (Demo Lab)
  first_login_at TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  extended_days  INTEGER NOT NULL DEFAULT 0,
  ended_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS demo_requests_status_idx ON demo_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_requests_user_idx   ON demo_requests (user_id);

-- Reply-To for emails sent to the owner (email_routing_setup.sql adds it too)
ALTER TABLE email_notifications_queue ADD COLUMN IF NOT EXISTS reply_to TEXT;

-- The demo users row points back at its request (also how the app knows a
-- signed-in person is a demo visitor and applies the public-demo locks).
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_request_id UUID;

-- New tables are not reachable through the API without explicit grants
-- (Supabase change, Oct 30 2026). Signed-out visitors may only INSERT.
GRANT INSERT ON public.demo_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_requests TO authenticated, service_role;

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_requests_insert ON demo_requests;
DROP POLICY IF EXISTS demo_requests_admin  ON demo_requests;
-- Anyone may file a request — but only a fresh one: no status, account or dates.
CREATE POLICY demo_requests_insert ON demo_requests FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND user_id IS NULL AND sent_at IS NULL AND first_login_at IS NULL
              AND expires_at IS NULL AND extended_days = 0 AND ended_at IS NULL);
-- Only the super admin reads and manages them.
CREATE POLICY demo_requests_admin ON demo_requests FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── A new request: an alert in the super admin bell + an email ──────────────
CREATE OR REPLACE FUNCTION demo_request_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  to_addr text; who text; what text; html text;
  esc text; prefs text;
BEGIN
  who  := NEW.first_name || ' ' || NEW.last_name;
  what := NEW.org_type || ' · ' || NEW.email
       || CASE WHEN NEW.wants_meeting THEN ' · wants a meeting'
               WHEN NEW.explore_only IS TRUE THEN ' · wants to explore the features'
               WHEN NEW.explore_only IS FALSE THEN ' · has questions' ELSE '' END;

  INSERT INTO admin_notifications (type, title, body)
  VALUES ('demo_request', 'New demo request: ' || who, what);

  SELECT trim(both '"' from value) INTO to_addr FROM settings WHERE key = 'admin_email';
  -- The bell's own email switch for Demo Requests (on unless turned off)
  SELECT value INTO prefs FROM settings WHERE key = 'admin_notif_prefs';
  IF prefs IS NOT NULL AND (prefs::jsonb -> 'demo_request' ->> 'email') = 'false' THEN to_addr := NULL; END IF;
  IF to_addr IS NOT NULL AND to_addr <> '' THEN
    esc := replace(replace(replace(COALESCE(NEW.note, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f2937">'
      || '<h2 style="color:#0C1140;margin:0 0 12px">New demo request</h2>'
      || '<table style="border-collapse:collapse;font-size:14px">'
      || '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Name</td><td><b>' || replace(replace(who, '<', '&lt;'), '>', '&gt;') || '</b></td></tr>'
      || '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Organization</td><td>' || NEW.org_type || '</td></tr>'
      || '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td>' || replace(replace(NEW.email, '<', '&lt;'), '>', '&gt;') || '</td></tr>'
      || '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Meeting</td><td>' || CASE WHEN NEW.wants_meeting THEN '<b>Yes — wants a virtual meeting</b>' ELSE 'No' END || '</td></tr>'
      || CASE WHEN NOT NEW.wants_meeting THEN '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Only exploring</td><td>' || CASE WHEN NEW.explore_only THEN 'Yes' WHEN NEW.explore_only IS FALSE THEN 'No — has questions' ELSE '—' END || '</td></tr>' ELSE '' END
      || CASE WHEN esc <> '' THEN '<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">Note</td><td>' || esc || '</td></tr>' ELSE '' END
      || '</table>'
      || '<p style="margin:18px 0 0"><a href="https://labhive.app/app" style="background:#1D9E75;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Open Demo Requests →</a></p>'
      || '<p style="color:#9ca3af;font-size:12px">Sign in as the super admin → Demo Requests to send access or decline.</p></div>';
    INSERT INTO email_notifications_queue (to_email, subject, body, html_body, type, reply_to)
    VALUES (to_addr, '[LabHive · Demo request] ' || who || ' — ' || NEW.org_type, 'New demo request from ' || who || ' (' || what || ').'
            || CASE WHEN NEW.note IS NOT NULL AND NEW.note <> '' THEN E'\nNote: ' || NEW.note ELSE '' END, html, 'demo_request',
            NEW.email);   -- Reply goes straight to the visitor
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'demo_request_notify: %', SQLERRM;   -- never lose the request itself
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS demo_request_notify_trg ON demo_requests;
CREATE TRIGGER demo_request_notify_trg AFTER INSERT ON demo_requests
  FOR EACH ROW EXECUTE FUNCTION demo_request_notify();

-- ── Called by the app right after a sign-in ─────────────────────────────────
-- Not a demo visitor → {demo:false}. Ended → switches the row off, {ended:true}.
-- First sign-in → starts the 15 days (plus any extension).
CREATE OR REPLACE FUNCTION demo_access_check() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r demo_requests%ROWTYPE;
BEGIN
  SELECT d.* INTO r FROM demo_requests d JOIN users u ON u.id = d.user_id
  WHERE u.auth_id::text = auth.uid()::text AND d.status IN ('sent', 'ended')
  ORDER BY d.sent_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('demo', false); END IF;

  IF r.status = 'ended' OR (r.expires_at IS NOT NULL AND r.expires_at < now()) THEN
    UPDATE demo_requests SET status = 'ended', ended_at = COALESCE(ended_at, now()) WHERE id = r.id;
    UPDATE users SET is_active = false WHERE id = r.user_id;
    RETURN jsonb_build_object('demo', true, 'ended', true);
  END IF;
  IF r.first_login_at IS NULL THEN
    UPDATE demo_requests SET first_login_at = now(),
      expires_at = now() + make_interval(days => 15 + r.extended_days)
    WHERE id = r.id;
  END IF;
  RETURN jsonb_build_object('demo', true, 'ended', false);
END $$;
REVOKE EXECUTE ON FUNCTION demo_access_check() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION demo_access_check() TO authenticated;

-- ── Nightly: end every demo past its date (also those who never came back) ──
CREATE OR REPLACE FUNCTION demo_expire_all() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH done AS (
    UPDATE demo_requests SET status = 'ended', ended_at = now()
    WHERE status = 'sent' AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING user_id)
  UPDATE users SET is_active = false WHERE id IN (SELECT user_id FROM done WHERE user_id IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION demo_expire_all() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION demo_expire_all() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-expiry') THEN PERFORM cron.unschedule('demo-expiry'); END IF;
  PERFORM cron.schedule('demo-expiry', '15 6 * * *', 'SELECT demo_expire_all()');   -- 06:15 UTC ≈ 1am Chicago
END $$;

NOTIFY pgrst, 'reload schema';

-- Check (expected: 1 | 2 | 1 | 1 | 1)
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'demo_requests') AS demo_table,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'demo_requests')                                        AS policies,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'demo_request_id') AS users_column,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'demo_request_notify_trg')                                   AS trigger,
  (SELECT count(*) FROM cron.job WHERE jobname = 'demo-expiry')                                                AS nightly_job;
