import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'fs'

// ─── Auto-update check: stamp every build with a unique id ──────────────────
// Windows/Chrome users reported that even a hard refresh sometimes kept
// showing the old build (intermediate CDN/proxy caching index.html). main.jsx
// fetches /app/version.json (no-store) on load and compares it against
// window.__BUILD_ID__ embedded in the currently-loaded HTML; a mismatch means
// a newer deploy exists, so it force-reloads once with a cache-busting param.
// Both values are written from this SAME buildId so a single deploy always
// produces a matching pair.
const buildId = Date.now().toString(36)
writeFileSync('docs/app/version.json', JSON.stringify({ buildId }))
console.log(`✓ docs/app/version.json written (buildId ${buildId})`)

// ─── SPA admin mirror ────────────────────────────────────────────────────────
let appSrc = readFileSync('docs/app/index.html', 'utf8')
appSrc = appSrc.replace('<head>', `<head>\n    <script>window.__BUILD_ID__=${JSON.stringify(buildId)}</script>`)
writeFileSync('docs/app/index.html', appSrc)
const adminHtml = appSrc.replace('<title>LabHive — Intelligent Lab Platform</title>', '<title>LabHive — Admin</title>')
mkdirSync('docs/app/admin', { recursive: true })
writeFileSync('docs/app/admin/index.html', adminHtml)
console.log('✓ docs/app/admin/index.html recreated')

// ─── Backward-compat redirect: labhive.app/admin → labhive.app/app/admin ────
mkdirSync('docs/admin', { recursive: true })
writeFileSync('docs/admin/index.html', `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=/app/admin">
<title>LabHive — Admin</title>
</head><body>
<script>window.location.replace('/app/admin' + window.location.search + window.location.hash)</script>
</body></html>`)
console.log('✓ docs/admin/index.html (redirect → /app/admin) recreated')

// ─── Clean up old docs/assets/ (stale from builds before base change) ───────
if (existsSync('docs/assets')) {
  rmSync('docs/assets', { recursive: true, force: true })
  console.log('✓ docs/assets/ (stale) removed')
}

// ─── Copy logo to docs/ root so email template URL stays stable ──────────────
if (existsSync('docs/app/logo.svg')) {
  copyFileSync('docs/app/logo.svg', 'docs/logo.svg')
  console.log('✓ docs/logo.svg copied from docs/app/logo.svg')
}

// ─── OAuth callback page ──────────────────────────────────────────────────────
writeFileSync('docs/oauth-callback.html', `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>iLab — connecting…</title></head>
<body>
<p style="font-family:sans-serif;color:#555;margin:40px auto;text-align:center;">Completing sign-in…</p>
<script>
  var search = window.location.search;
  if (search) {
    window.location.href = 'ilab://oauth-callback' + search;
    setTimeout(function() {
      window.location.href = 'https://labhive.app/app' + search;
    }, 600);
  }
</script>
</body>
</html>`)
console.log('✓ docs/oauth-callback.html recreated')

// ─── Root files ───────────────────────────────────────────────────────────────
writeFileSync('docs/CNAME', 'labhive.app')
console.log('✓ docs/CNAME recreated')

writeFileSync('docs/.nojekyll', '')
console.log('✓ docs/.nojekyll recreated')

// ─── Sitemap ──────────────────────────────────────────────────────────────────
writeFileSync('docs/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://labhive.app/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>https://labhive.app/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://labhive.app/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>`)
console.log('✓ docs/sitemap.xml recreated')

writeFileSync('docs/robots.txt', `User-agent: *
Allow: /
Disallow: /app/

Sitemap: https://labhive.app/sitemap.xml`)
console.log('✓ docs/robots.txt recreated')

// ─── Static landing page at labhive.app/ ─────────────────────────────────────
// The page is its own file (landing/index.html), not a string in this script:
// its tour script is full of backticks and \${}, which a template literal here
// would have to escape one by one. Photos for the tours are in public/tour/.
copyFileSync('landing/index.html', 'docs/index.html')
console.log('✓ docs/index.html (landing page) written')

// ─── Privacy policy ───────────────────────────────────────────────────────────
mkdirSync('docs/privacy', { recursive: true })
writeFileSync('docs/privacy/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — LabHive</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
    .back-btn { display: inline-block; margin-bottom: 32px; padding: 8px 18px; background: #f1f5f9; border-radius: 8px; font-size: 14px; font-weight: 600; color: #0C1140; text-decoration: none; border: 1px solid #e2e8f0; }
    .back-btn:hover { background: #e2e8f0; }
  </style>
</head>
<body>
  <a href="/" class="back-btn">← Back to LabHive</a>
  <h1>Privacy Policy</h1>
  <div class="updated">Last updated: June 2026</div>
  <p>LabHive ("the platform", "we", "us") is an all-in-one research lab management platform available at <strong>labhive.app</strong>. This policy explains what information we collect, how we use it, and your rights.</p>

  <h2>1. Information We Collect</h2>
  <ul>
    <li><strong>Account information:</strong> your name and email address, provided at sign-up (Solo accounts) or created by your lab administrator (Team accounts).</li>
    <li><strong>Profile data:</strong> optional avatar, photo, and display preferences you set in your profile.</li>
    <li><strong>Lab activity data:</strong> equipment bookings, inspection results, training certificates, project materials, maintenance records, and barcode/QR records you create within the platform.</li>
    <li><strong>Equipment photos:</strong> before/after condition photos uploaded as part of the booking process.</li>
    <li><strong>Files and documents:</strong> training certificates, project records, SOPs, floor plans, and other documents you upload, stored in your chosen storage provider.</li>
    <li><strong>Messages:</strong> messages sent between lab staff and users through the LabHive messaging feature.</li>
    <li><strong>Support requests:</strong> subject, message, and contact email you provide when submitting a customer service request.</li>
    <li><strong>Usage and error data:</strong> anonymous technical error reports used to improve platform stability. These do not contain personal information.</li>
  </ul>

  <h2>2. How We Use Your Information</h2>
  <ul>
    <li>To operate all lab management features: equipment booking &amp; approval, inspections, training records, projects, preventive maintenance, and messaging</li>
    <li>To send booking confirmations, reminders, and status notifications</li>
    <li>To allow lab managers and administrators to review and manage lab activity within their organisation</li>
    <li>To respond to customer service and support requests</li>
    <li>To detect and fix technical errors in the platform</li>
    <li>To notify the platform administrator of new user registrations and system alerts</li>
  </ul>

  <h2>3. Solo Workspace Sharing</h2>
  <p>LabHive Solo users may invite other users to view or collaborate on their personal workspace. When you accept an invitation, the workspace owner can see your name. You can leave a shared workspace at any time from your Profile settings.</p>

  <h2>4. Cloud Storage Integrations</h2>
  <p>LabHive supports optional personal cloud storage providers for file uploads. When you connect a provider, the following applies:</p>
  <ul>
    <li><strong>Google Drive:</strong> LabHive uses the Google Drive API to store and retrieve your files in a dedicated "LabHive Files" folder. We request only the permissions needed to manage files in that folder and do not read, modify, or delete any other content. You can revoke access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank">Google Account permissions page</a>.</li>
    <li><strong>Microsoft OneDrive:</strong> Files are stored in the app's designated AppFolder. We access only LabHive-created files. You can revoke access from your Microsoft account settings.</li>
    <li><strong>WebDAV:</strong> Files are stored on the server you configure. LabHive does not store your WebDAV credentials beyond your device's local storage.</li>
  </ul>
  <p>Organisational files (SOPs, equipment photos, module images, floor plans) are always stored in LabHive's Supabase Storage regardless of your personal storage choice.</p>

  <h2>5. Data Storage</h2>
  <p>Platform data is stored in a Supabase database hosted in the United States. File uploads are stored either in Supabase Storage or in your chosen personal storage provider.</p>

  <h2>6. Data Sharing</h2>
  <p>We do not sell or share your personal data with third parties. Within the platform, data is accessible only to members of your organisation and authorised administrators. Support request content is accessible to the platform administrator for the purpose of responding to your request.</p>

  <h2>7. Data Retention &amp; Deletion</h2>
  <p>Your data is retained for as long as your account is active. To request deletion of your account and all associated data, contact your lab administrator or reach us at the address below.</p>

  <h2>8. Cookies &amp; Local Storage</h2>
  <p>LabHive uses browser local storage to maintain your login session, storage provider preferences, and dashboard settings. No third-party tracking cookies are used.</p>

  <h2>9. Contact</h2>
  <p>For privacy questions or data requests: <a href="mailto:support@labhive.app">support@labhive.app</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 LabHive. <a href="/" style="color:#aaa;">Back to home</a></p>
</body>
</html>`)
console.log('✓ docs/privacy/index.html recreated')

// ─── Terms of service ──────────────────────────────────────────────────────────
mkdirSync('docs/terms', { recursive: true })
writeFileSync('docs/terms/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service — LabHive</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
    .back-btn { display: inline-block; margin-bottom: 32px; padding: 8px 18px; background: #f1f5f9; border-radius: 8px; font-size: 14px; font-weight: 600; color: #0C1140; text-decoration: none; border: 1px solid #e2e8f0; }
    .back-btn:hover { background: #e2e8f0; }
  </style>
</head>
<body>
  <a href="/" class="back-btn">← Back to LabHive</a>
  <h1>Terms of Service</h1>
  <div class="updated">Last updated: June 2026</div>
  <p>By using LabHive ("the platform") at <strong>labhive.app</strong>, you agree to these terms. Please read them carefully.</p>

  <h2>1. About LabHive</h2>
  <p>LabHive is an all-in-one research lab management platform providing equipment booking, room and supply inspections, training records, project management, preventive maintenance, barcode/QR management, team messaging, and related tools for research laboratories.</p>

  <h2>2. Account Types &amp; Access</h2>
  <p>LabHive offers two account types:</p>
  <ul>
    <li><strong>LabHive Team:</strong> Organisation-based accounts managed by a lab administrator. Access is granted by your organisation and is subject to your organisation's policies.</li>
    <li><strong>LabHive Solo:</strong> Individual researcher accounts. You may create a free Solo account to manage your own lab resources independently.</li>
  </ul>
  <p>You are responsible for keeping your login credentials confidential. If you believe your account has been compromised, notify your lab administrator or contact us immediately. You may not share your account credentials with others.</p>

  <h2>3. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the platform for any unlawful purpose</li>
    <li>Attempt to access accounts, data, or administrative functions you are not authorised to access</li>
    <li>Upload malicious files, scripts, or content of any kind</li>
    <li>Interfere with the operation of the platform or its infrastructure</li>
    <li>Use automated tools to scrape, overload, or abuse the platform</li>
    <li>Misrepresent your identity or organisational affiliation</li>
  </ul>

  <h2>4. Equipment Booking</h2>
  <p>Equipment bookings made through LabHive are subject to approval by lab administrators. Approved bookings create a commitment to use the equipment at the scheduled time. You agree to complete any required before/after condition photos where requested and to report equipment issues promptly.</p>

  <h2>5. Content You Upload</h5>
  <p>You retain ownership of files, photos, and documents you upload. By uploading content, you grant LabHive permission to store and display it as part of the platform's functionality. You are responsible for ensuring you have the right to upload any content you submit, and that it does not violate any laws or third-party rights.</p>

  <h2>6. Solo Workspace Sharing</h2>
  <p>Solo users may invite collaborators to their personal workspace. You are responsible for managing your invitations and the access you grant. LabHive is not responsible for actions taken by invited collaborators within your workspace.</p>

  <h2>7. Cloud Storage Integrations</h2>
  <p>If you connect a third-party storage provider (Google Drive, OneDrive, or WebDAV), your use of that service is also governed by that provider's terms of service. LabHive accesses only the files it creates in your designated folder and does not read or modify other content.</p>
  <ul>
    <li>Google Drive: subject to <a href="https://policies.google.com/terms" target="_blank">Google's Terms of Service</a></li>
    <li>Microsoft OneDrive: subject to <a href="https://www.microsoft.com/en-us/servicesagreement" target="_blank">Microsoft's Services Agreement</a></li>
  </ul>

  <h2>8. Customer Support</h2>
  <p>Support requests submitted through LabHive are reviewed by the platform administrator. We aim to respond within a reasonable timeframe but do not guarantee response times.</p>

  <h2>9. Availability</h2>
  <p>We aim to keep LabHive available at all times but do not guarantee uninterrupted access. We may update, modify, or perform maintenance on the platform at any time, with or without prior notice.</p>

  <h2>10. Limitation of Liability</h2>
  <p>LabHive is provided "as is" without warranties of any kind. We are not liable for any loss of data, missed bookings, equipment damage, or other damages arising from use of the platform.</p>

  <h2>11. Changes to These Terms</h2>
  <p>We may update these terms from time to time. Continued use of the platform after changes are posted constitutes acceptance of the updated terms.</p>

  <h2>12. Contact</h2>
  <p>Questions about these terms: <a href="mailto:support@labhive.app">support@labhive.app</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 LabHive. <a href="/" style="color:#aaa;">Back to home</a></p>
</body>
</html>`)
console.log('✓ docs/terms/index.html recreated')
