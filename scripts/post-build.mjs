import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'

// Recreate docs/admin/index.html after every build.
// Vite wipes docs/ on each build, so GitHub Pages loses the /admin SPA route.
const src = readFileSync('docs/index.html', 'utf8')
const admin = src.replace('<title>iLab — Intelligent Laboratory</title>', '<title>iLab — Admin</title>')
mkdirSync('docs/admin', { recursive: true })
writeFileSync('docs/admin/index.html', admin)
console.log('✓ docs/admin/index.html recreated')

// Recreate docs/oauth-callback.html — OAuth bridge page for Google Drive / OneDrive PKCE flow.
// Tries ilab:// deep link (native), falls back to main SPA URL (web) after 600ms.
writeFileSync('docs/oauth-callback.html', `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>iLab — connecting…</title></head>
<body>
<p style="font-family:sans-serif;color:#555;margin:40px auto;text-align:center;">Completing sign-in…</p>
<script>
  var search = window.location.search;
  if (search) {
    // Native Capacitor in-app browser: deep link fires appUrlOpen in the app
    window.location.href = 'ilab://oauth-callback' + search;
    // Web fallback: redirect to SPA (handles both success ?code= and error ?error=)
    setTimeout(function() {
      window.location.href = 'https://ilabapp.org/ilab/' + search;
    }, 600);
  }
</script>
</body>
</html>`)
console.log('✓ docs/oauth-callback.html recreated')

// CNAME — custom domain for GitHub Pages
writeFileSync('docs/CNAME', 'ilabapp.org')
console.log('✓ docs/CNAME recreated')

// Privacy policy
mkdirSync('docs/privacy', { recursive: true })
writeFileSync('docs/privacy/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — iLab</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <div class="updated">Last updated: May 2026</div>
  <p>iLab ("the app", "we", "us") is a lab management system. This policy explains what information we collect, how we use it, and your rights.</p>
  <h2>Information We Collect</h2>
  <ul>
    <li><strong>Account information:</strong> your name and email address, provided when your account is created by a lab administrator.</li>
    <li><strong>Usage data:</strong> booking records, inspection results, training certificates, and project materials you create within the app.</li>
    <li><strong>Photos:</strong> equipment condition photos you upload as part of the booking process.</li>
    <li><strong>Files:</strong> documents you upload (training certificates, project records) stored in your chosen storage provider.</li>
  </ul>
  <h2>Google Drive Integration</h2>
  <p>If you choose Google Drive as your file storage provider, iLab uses the Google Drive API to store and retrieve your files in a dedicated "iLab Files" folder in your Google Drive. We request only the permissions needed to manage files in that folder. We do not read, modify, or delete any other files in your Google Drive. You can revoke access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank">Google Account permissions page</a>.</p>
  <h2>How We Use Your Information</h2>
  <ul>
    <li>To operate the lab management features (bookings, inspections, training, projects)</li>
    <li>To send booking confirmations and reminders</li>
    <li>To allow lab managers and administrators to review lab activity</li>
  </ul>
  <h2>Data Storage</h2>
  <p>Data is stored in a Supabase database hosted in the United States. File uploads are stored either in Supabase Storage or in your chosen personal storage provider (Google Drive, OneDrive, or WebDAV).</p>
  <h2>Data Sharing</h2>
  <p>We do not sell or share your personal data with third parties. Data is only accessible to members of your organisation and the system administrator.</p>
  <h2>Data Deletion</h2>
  <p>To request deletion of your account and associated data, contact your lab administrator or email us at the address below.</p>
  <h2>Contact</h2>
  <p>For privacy questions: <a href="mailto:motlagh999@gmail.com">motlagh999@gmail.com</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 iLab. <a href="/" style="color:#aaa;">Back to app</a></p>
</body>
</html>`)
console.log('✓ docs/privacy/index.html recreated')

// Terms of service
mkdirSync('docs/terms', { recursive: true })
writeFileSync('docs/terms/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms of Service — iLab</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 36px; }
    p, li { font-size: 15px; color: #333; }
    a { color: #1D9E75; }
    .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <div class="updated">Last updated: May 2026</div>
  <p>By using iLab ("the app"), you agree to these terms. Please read them carefully.</p>
  <h2>1. Use of the App</h2>
  <p>iLab is a lab management system provided for use by authorised members of participating organisations. Access is granted by your lab administrator. You agree to use the app only for its intended purpose — managing lab bookings, inspections, training records, and related activities.</p>
  <h2>2. Your Account</h2>
  <p>You are responsible for keeping your login credentials confidential. If you believe your account has been compromised, notify your lab administrator immediately. You may not share your account with others.</p>
  <h2>3. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the app for any unlawful purpose</li>
    <li>Attempt to access accounts or data belonging to other users</li>
    <li>Upload malicious files or content</li>
    <li>Interfere with the operation of the app or its infrastructure</li>
  </ul>
  <h2>4. Content You Upload</h2>
  <p>You retain ownership of files and photos you upload. By uploading content, you grant iLab permission to store and display it as part of the app's functionality. You are responsible for ensuring you have the right to upload any content you submit.</p>
  <h2>5. Google Drive Integration</h2>
  <p>If you connect Google Drive as your file storage provider, your use of Google Drive is also subject to <a href="https://policies.google.com/terms" target="_blank">Google's Terms of Service</a>. iLab accesses only the files it creates in your Drive and does not read or modify any other content.</p>
  <h2>6. Availability</h2>
  <p>We aim to keep iLab available at all times but do not guarantee uninterrupted access. We may update or modify the app at any time without prior notice.</p>
  <h2>7. Limitation of Liability</h2>
  <p>iLab is provided "as is" without warranties of any kind. We are not liable for any loss of data, missed bookings, or other damages arising from use of the app.</p>
  <h2>8. Changes to These Terms</h2>
  <p>We may update these terms from time to time. Continued use of the app after changes constitutes acceptance of the updated terms.</p>
  <h2>9. Contact</h2>
  <p>Questions about these terms: <a href="mailto:motlagh999@gmail.com">motlagh999@gmail.com</a></p>
  <p style="margin-top:48px;font-size:13px;color:#aaa;">© 2026 iLab. <a href="/" style="color:#aaa;">Back to app</a></p>
</body>
</html>`)
console.log('✓ docs/terms/index.html recreated')
