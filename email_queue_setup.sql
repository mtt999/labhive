-- ================================================================
-- Email queue processor setup — run in Supabase SQL Editor.
-- Pairs with the send-emails Edge Function (supabase/functions/send-emails).
-- ================================================================

-- 1. Add the columns the processor needs (idempotent).
ALTER TABLE email_notifications_queue
  ADD COLUMN IF NOT EXISTS sent       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error      text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Fast lookup of the unsent backlog.
CREATE INDEX IF NOT EXISTS idx_email_queue_unsent
  ON email_notifications_queue (sent, created_at) WHERE sent = false;

-- 2. ⚠️ IMPORTANT — clear the STALE backlog BEFORE scheduling the cron.
--    Every notification the app ever "sent" is still sitting in this table
--    unsent. If you enable the cron without this, users get flooded with
--    weeks of old emails on the first run. This marks all existing rows as
--    already handled so only NEW notifications go out.
--    (Comment this out only if you truly want the backlog delivered.)
UPDATE email_notifications_queue SET sent = true WHERE sent = false;

-- 3. Schedule the Edge Function every minute via pg_cron + pg_net.
--    Requires the extensions (Supabase: Database → Extensions → enable
--    `pg_cron` and `pg_net`).  You can also do this in the dashboard under
--    Integrations → Cron instead of this SQL.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace <ANON_KEY> with your project's anon/publishable key (safe to use
-- here — it only authorizes invoking the function; the function itself uses
-- the service role internally).
-- ⚠️ Replace <LABHIVE_LEGACY_JWT_KEY> with the eyJ... anon key from
-- Supabase Dashboard → Project Settings → API → anon/public key
SELECT cron.schedule(
  'send-emails-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://qhsxtpywfczqopcimykk.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer <LABHIVE_LEGACY_JWT_KEY>',
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
  $cron$
);

-- To inspect / remove the schedule later:
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('send-emails-every-minute');


-- ================================================================
-- 4. Support form → real email routing (added Sept 2026)
--
-- CustomerServiceModal (the "Contact Customer Service" form, opened via
-- ?support=1 or the header ? menu) only ever wrote to support_messages —
-- no email was ever sent anywhere, it just sat in the Admin panel.
--
-- This trigger fires on every new support_messages row and queues a real
-- email via the existing send-emails/Resend pipeline, routed by who sent it:
--   login_mode = 'solo'          -> solo@labhive.app
--   login_mode = 'team' or NULL  -> support@labhive.app  (covers guests too)
--
-- SECURITY DEFINER is required: support_messages allows INSERT from `anon`
-- (guests on the login page), but email_notifications_queue only allows
-- INSERT from `authenticated` — without SECURITY DEFINER a guest's message
-- would trigger but silently fail the queue insert due to RLS.
-- ================================================================

ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS login_mode TEXT;
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

DROP TRIGGER IF EXISTS support_message_email_trigger ON support_messages;
CREATE TRIGGER support_message_email_trigger
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION queue_support_email();
