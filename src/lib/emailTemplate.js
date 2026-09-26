// PNG, not the SVG the rest of the site uses: Gmail, Outlook and the iOS Mail
// app all refuse to render SVG in an <img>, so the logo was simply absent from
// every email we have ever sent. Rendered at 2x (125x144) for retina clients
// and displayed at 62x72 — the logo is taller than it is wide, so the old
// square 72x72 slot was also squashing it.
// Served from /app/ — that is the SPA's public dir, the one the build
// actually copies. docs/logo-email.png at the site root would 404.
const LOGO_URL = 'https://labhive.app/app/logo-email.png'
const APP_URL  = 'https://labhive.app/app'

export function buildEmailHtml({ title, body, bodyHtml = null, ctaLabel = 'View in LabHive →', ctaUrl = APP_URL, prefsUrl = APP_URL, orgContact = null, credentials = null }) {
  const credentialsBlock = credentials ? `
        <tr>
          <td style="padding:0 36px 20px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;">
              <div style="margin-bottom:10px;">
                <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#9CA3AF;margin-bottom:4px;">Email</div>
                <div style="font-size:14px;font-weight:600;color:#111827;font-family:monospace;">${escHtml(credentials.email)}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#9CA3AF;margin-bottom:4px;">Temporary Password</div>
                <div style="font-size:14px;font-weight:600;color:#111827;font-family:monospace;">${escHtml(credentials.password)}</div>
              </div>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">These credentials expire in 72 hours if unused.</p>
          </td>
        </tr>` : ''

  const contactBlock = orgContact?.contact_email ? `
        <tr>
          <td style="padding:0 36px 24px;">
            <div style="background:#f0f9f6;border:1px solid #c6e6d8;border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-size:12px;color:#6B7280;margin-bottom:5px;">Questions? Contact your lab administrator</div>
              ${orgContact.contact_name ? `<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:3px;">${escHtml(orgContact.contact_name)}</div>` : ''}
              <a href="mailto:${escHtml(orgContact.contact_email)}" style="font-size:13px;color:#1D9E75;text-decoration:none;font-weight:500;">${escHtml(orgContact.contact_email)}</a>
            </div>
          </td>
        </tr>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:#0d47a1;padding:28px 32px 24px;text-align:center;">
            <img src="${LOGO_URL}" width="62" height="72" alt="LabHive logo" style="display:block;margin:0 auto 12px;border:0;">
            <div style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;line-height:1;">LabHive</div>
            <div style="color:#ffb380;font-size:11px;font-weight:400;letter-spacing:1.2px;text-transform:uppercase;margin-top:5px;">The All-in-One Research Lab Platform</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 24px;">
            <h2 style="margin:0 0 14px;font-size:17px;font-weight:700;color:#111827;line-height:1.4;">${escHtml(title)}</h2>
            ${bodyHtml
              // bodyHtml is inserted RAW, so it is only ever passed content we
              // author. `body` stays escaped and is what the plain-text part
              // uses, so a mail client without HTML still reads correctly.
              ? bodyHtml
              : `<p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.7;">${escHtml(body)}</p>`}
          </td>
        </tr>

        ${credentialsBlock}

        <!-- CTA button -->
        <tr>
          <td style="padding:0 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
              <tr><td align="center">
                <a href="${ctaUrl}" style="display:inline-block;background:#1D9E75;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.1px;">${escHtml(ctaLabel)}</a>
              </td></tr>
            </table>

            <!-- Notification prefs link (directly under the button) -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center">
                <a href="${prefsUrl}" style="font-size:12px;color:#6B7280;text-decoration:underline;">Manage notification preferences</a>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Org contact block -->
        ${contactBlock}

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.6;">
              You received this notification because you are a member of a LabHive organization.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
