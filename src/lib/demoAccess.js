import { sb } from './supabase'

// "Request a demo" (Nov 2026) — personal demo logins to the Demo Lab.
// See demo_requests_setup.sql. The 15-day limit is BACK END ONLY: no visitor
// is told it. It starts at their first sign-in and is enforced here (sign-in
// and session restore) and by the nightly demo-expiry job.

export const DEMO_LAB_SLUG = 'demo-lab'
export const DEMO_DAYS = 15
// Where a visitor's Reply to the welcome / decline email goes
export const DEMO_REPLY_TO = 'support@labhive.app'
// The links on the "demo access has ended" message
export const QUOTE_MAILTO = 'mailto:quote@labhive.app?subject=%5BLabHive%20%C2%B7%20Quote%20request%5D%20Team%20Plan'
export const DEMO_AGAIN_URL = 'https://labhive.app/?demo=1#pricing'
// Set before signing out an ended demo on session restore, read once by Login
export const DEMO_ENDED_FLAG = 'labhive_demo_ended'

// Right after a sign-in: starts the 15 days on the first one, and reports an
// ended demo. Anyone who is not a demo visitor (or a database without the
// function yet) gets { demo: false } and carries on as normal.
export async function checkDemoAccess() {
  try {
    const { data, error } = await sb.rpc('demo_access_check')
    if (error || !data) return { demo: false }
    return { demo: !!data.demo, ended: !!data.ended }
  } catch { return { demo: false } }
}

// A readable password for the welcome email: Hive-XXXX-XXXX (no 0/O/1/I)
export function demoPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), v => abc[v % abc.length]).join('')
  return `Hive-${pick(4)}-${pick(4)}`
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Welcome email: design A "Clean card" ─────────────────────────────────────
// Table layout + inline styles so Outlook and Gmail render it the same. The
// only picture is the logo; everything that matters is text.
export function demoWelcomeEmail({ firstName, email, password, wantsMeeting }) {
  const subject = 'Your LabHive demo is ready'
  const text = [
    `Hi ${firstName},`,
    '',
    "We've set up your own login to the LabHive Demo Lab, a sample lab filled with projects, equipment, bookings and training records, so you can try everything for real.",
    '',
    'Sign in at: https://labhive.app/app',
    `Username: ${email}`,
    `Password: ${password}`,
    '',
    'Try these first:',
    '- Book an instrument by dragging on the calendar',
    "- Open a lab user's training record and approve a certificate",
    '- Print a QR label for a material and scan it with your phone',
    ...(wantsMeeting ? ['', "Let's meet: you asked for a virtual meeting. Reply to this email with two or three times that suit you, and we'll send an invite."] : []),
    '',
    'LabHive · labhive.app',
  ].join('\n')

  const row = (label, value, mono) => `<tr><td style="padding:5px 0;width:96px;color:#8a93a3;font-size:12px;letter-spacing:.5px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">${label}</td><td style="padding:5px 0;font-size:15px;font-weight:700;color:#0C1140;font-family:${mono ? "'SFMono-Regular',Menlo,Consolas,monospace" : 'Arial,Helvetica,sans-serif'}">${value}</td></tr>`
  const tryRow = (icon, txt) => `<tr><td style="width:34px;padding:7px 0;font-size:18px">${icon}</td><td style="padding:7px 0;font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif">${txt}</td></tr>`
  const meeting = wantsMeeting ? `
        <tr><td style="padding:18px 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4ff;border:1px solid #c7d7fe;border-radius:12px"><tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e3a8a">
            <b style="display:block;margin-bottom:2px">📅 Let's meet</b>You asked for a virtual meeting. Reply to this email with two or three times that suit you, and we'll send an invite.
          </td></tr></table>
        </td></tr>` : ''

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="height:6px;line-height:6px;font-size:0;background:#1D9E75;background-image:linear-gradient(90deg,#1D9E75,#34d399,#FF6B1A)">&nbsp;</td></tr>
    <tr><td style="padding:32px 36px 34px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:26px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#0C1140">
          <img src="https://labhive.app/app/logo-email.png" width="34" alt="LabHive" style="vertical-align:middle;border:0;margin-right:10px">LabHive
        </td></tr>
        <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;font-weight:700;color:#0C1140;padding-bottom:10px">Your demo lab is ready, ${esc(firstName)} 👋</td></tr>
        <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#4b5563;padding-bottom:18px">We've set up your own login to the LabHive Demo Lab, a sample lab filled with projects, equipment, bookings and training records, so you can try everything for real.</td></tr>
        <tr><td style="padding-bottom:24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;border:1px solid #e5e9f0;border-radius:12px"><tr><td style="padding:14px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row('Sign in at', '<a href="https://labhive.app/app" style="color:#1D9E75;text-decoration:none">labhive.app/app</a>')}
              ${row('Username', esc(email), true)}
              ${row('Password', esc(password), true)}
            </table>
          </td></tr></table>
        </td></tr>
        <tr><td>
          <a href="https://labhive.app/app" style="display:inline-block;background:#1D9E75;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px">Open the Demo Lab →</a>
        </td></tr>${meeting}
        <tr><td style="padding-top:28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0f4"><tr><td style="padding-top:22px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:#1D9E75">Try these first</td></tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
            ${tryRow('📅', 'Book an instrument by dragging on the calendar')}
            ${tryRow('🎓', "Open a lab user's training record and approve a certificate")}
            ${tryRow('🧪', 'Print a QR label for a material and scan it with your phone')}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td align="center" style="padding:22px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#8a93a3">
    LabHive · Lab management for research labs<br>
    <a href="https://labhive.app" style="color:#6b7280">labhive.app</a> · <a href="https://labhive.app/app?support=1" style="color:#6b7280">Contact us</a><br>
    You're receiving this because you requested a LabHive demo.
  </td></tr></table>
</td></tr></table>
</body></html>`
  return { subject, text, html }
}

// ── A short, polite decline ──────────────────────────────────────────────────
export function demoDeclineEmail({ firstName }) {
  const subject = 'Your LabHive demo request'
  const text = `Hi ${firstName},\n\nThank you for your interest in LabHive. We are not able to set up a demo login for this request, but we would be glad to help: request a quote at quote@labhive.app or contact us at https://labhive.app/app?support=1.\n\nLabHive · labhive.app`
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="height:6px;line-height:6px;font-size:0;background:#1D9E75">&nbsp;</td></tr>
    <tr><td style="padding:30px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#4b5563">
      <p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#0C1140">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 14px">Thank you for your interest in LabHive. We are not able to set up a demo login for this request, but we would be glad to help another way.</p>
      <p style="margin:0"><a href="mailto:quote@labhive.app?subject=%5BLabHive%20%C2%B7%20Quote%20request%5D%20Team%20Plan" style="color:#1D9E75;font-weight:700">Request a quote</a> · <a href="https://labhive.app/app?support=1" style="color:#1D9E75;font-weight:700">Contact us</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`
  return { subject, text, html }
}
