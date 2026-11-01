-- email_routing_setup.sql — LabHive. Idempotent: safe to run again.
--
-- Every email that reaches the owner's inbox (labhive.app mail is forwarded
-- to Gmail by Cloudflare Email Routing) starts with "[LabHive · <type>]" so
-- Gmail can label and filter it, and Reply answers the right person:
--   [LabHive · Customer Service] <subject>      reply → the person who wrote
--   [LabHive · Solo support] <subject>          reply → the person who wrote
--   [LabHive · Demo request] <name> — <org>     reply → the visitor
--   [LabHive · Problem report] <who> (<screen)> reply → the reporter
--   [LabHive · Settings report] <n> changes
-- The same functions live in email_queue_setup.sql, demo_requests_setup.sql
-- and change_log_setup.sql (updated together), so re-running those files
-- does not undo this.
--
-- After running this: redeploy the send-emails Edge Function (it now passes
-- reply_to to Resend).

ALTER TABLE email_notifications_queue ADD COLUMN IF NOT EXISTS reply_to TEXT;

CREATE OR REPLACE FUNCTION queue_support_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dest text := CASE WHEN NEW.login_mode = 'solo' THEN 'solo@labhive.app' ELSE 'support@labhive.app' END;
  -- Sara's "report a problem" (src/lib/reportIssue.js) arrives here too; this
  -- trigger is its ONLY email, so it gets its own label.
  kind text := CASE WHEN NEW.subject LIKE 'Problem report from %' THEN 'Problem report'
                    WHEN NEW.login_mode = 'solo' THEN 'Solo support'
                    ELSE 'Customer Service' END;
BEGIN
  -- "[LabHive · Customer Service] <subject>" so Gmail can label it; Reply
  -- answers the person who wrote (reply_to), not noreply@.
  INSERT INTO email_notifications_queue (to_email, subject, body, user_id, type, reply_to)
  VALUES (
    dest,
    '[LabHive · ' || kind || '] ' || NEW.subject,
    'From: ' || COALESCE(NEW.user_name, 'Guest') || ' <' || NEW.user_email || '>' || E'\n\n' ||
    NEW.message ||
    CASE WHEN NEW.attachment_url IS NOT NULL THEN E'\n\nAttachment: ' || NEW.attachment_url ELSE '' END,
    NEW.user_id,
    'support_message',
    NULLIF(NEW.user_email, '')
  );
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION queue_change_digest() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  to_addr text; n integer; txt text; html text; r record; vals text;
BEGIN
  SELECT value INTO to_addr FROM settings WHERE key = 'admin_email';
  SELECT count(*) INTO n FROM change_log WHERE NOT digested;
  IF n = 0 OR to_addr IS NULL OR to_addr = '' THEN RETURN 0; END IF;

  txt  := n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END || ' since the last report:' || E'\n\n';
  html := '<p style="font-family:Arial,sans-serif">' || n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END
       || ' since the last report:</p><table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse">';
  FOR r IN SELECT * FROM change_log WHERE NOT digested ORDER BY changed_at LOOP
    vals := CASE WHEN r.action = 'changed' THEN array_to_string(r.fields, ', ') ELSE '' END;
    txt  := txt || to_char(r.changed_at AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || '  '
         || CASE r.table_name WHEN 'organizations' THEN 'Organization settings' ELSE 'App settings' END
         || ' ' || r.action || ': ' || COALESCE(r.row_label, '—')
         || CASE WHEN vals <> '' THEN ' (' || vals || ')' ELSE '' END || ' — ' || r.changed_by || E'\n';
    html := html || '<tr><td style="padding:4px 10px;color:#666;white-space:nowrap">'
         || to_char(r.changed_at AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || '</td><td style="padding:4px 10px"><b>'
         || CASE r.table_name WHEN 'organizations' THEN 'Organization settings' ELSE 'App settings' END
         || ' ' || r.action || '</b>: ' || replace(replace(COALESCE(r.row_label, '—'), '<', '&lt;'), '>', '&gt;')
         || CASE WHEN vals <> '' THEN ' <span style="color:#666">(' || vals || ')</span>' ELSE '' END
         || '</td><td style="padding:4px 10px;color:#666">' || replace(replace(r.changed_by, '<', '&lt;'), '>', '&gt;') || '</td></tr>';
  END LOOP;
  html := html || '</table><p style="font-family:Arial,sans-serif;color:#666">Before and after values are in the Change log in the super admin panel.</p>';

  INSERT INTO email_notifications_queue (to_email, subject, body, html_body, type)
  VALUES (to_addr, '[LabHive · Settings report] ' || n || ' change' || CASE WHEN n = 1 THEN '' ELSE 's' END, txt, html, 'change_digest');
  UPDATE change_log SET digested = TRUE WHERE NOT digested;
  RETURN n;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check (expected: 1 | 1 | 1 | 1)
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'email_notifications_queue' AND column_name = 'reply_to') AS reply_to_column,
  (SELECT count(*) FROM pg_proc WHERE proname = 'queue_support_email' AND prosrc LIKE '%Problem report%')               AS support_subject,
  (SELECT count(*) FROM pg_proc WHERE proname = 'demo_request_notify' AND prosrc LIKE '%[LabHive · Demo request]%')       AS demo_subject,
  (SELECT count(*) FROM pg_proc WHERE proname = 'queue_change_digest' AND prosrc LIKE '%Settings report%')                AS digest_subject;
