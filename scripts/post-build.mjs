import { readFileSync, mkdirSync, writeFileSync } from 'fs'

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
    window.location.href = 'ilab://oauth-callback' + search;
    setTimeout(function() {
      window.location.href = 'https://mtt999.github.io/ilab/' + search;
    }, 600);
  }
</script>
</body>
</html>`)
console.log('✓ docs/oauth-callback.html recreated')
