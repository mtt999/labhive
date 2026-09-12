import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Auto-recover from stale deployments. Lazy chunks (Admin, jspdf, exceljs, …)
// have hashed filenames that change on every deploy; a browser holding an old
// index.html requests a chunk that no longer exists and the dynamic import
// fails ("jspdf failed" on Windows machines with older cache). Vite fires
// vite:preloadError for exactly this case — reload to fetch the fresh build.
//
// The guard is time-based, NOT once-per-session. A one-shot boolean meant that
// after any single recovery, every later stale chunk in that tab failed
// silently and its <Suspense> hung forever — a long-lived tab that had already
// reloaded once would open e.g. the Admin Panel to a permanent spinner. A
// cooldown still prevents a reload loop (a chunk that 404s even on the fresh
// build won't retry more than once per RELOAD_COOLDOWN_MS) while letting each
// genuinely new deploy recover.
const RELOAD_COOLDOWN_MS = 30000
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  const last = Number(sessionStorage.getItem('ilab_chunk_reload_at') || 0)
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return
  sessionStorage.setItem('ilab_chunk_reload_at', String(Date.now()))
  window.location.reload()
})

// Apply tooltip preference before first render
if (localStorage.getItem('ilab_show_tooltips') === 'false') {
  document.body.classList.add('tooltips-off')
}

// Auto-recover from a cached-stale index.html. Every build stamps a unique
// window.__BUILD_ID__ (see post-build.mjs) and writes the same value to
// /app/version.json. If an intermediate cache (CDN, corporate proxy, browser)
// serves an old index.html, a plain reload just re-fetches the SAME stale
// HTML from cache — this instead fetches version.json with cache disabled,
// and if it doesn't match, force-navigates with a cache-busting query param
// so the browser can't reuse the stale response.
//
// The guard is keyed to the buildId we are jumping TO, not a plain "have I
// ever reloaded" boolean. The boolean was loop-proof but went permanently
// blind: one recovery disabled the check for the life of the tab, so every
// later deploy went undetected. Keying by target buildId keeps the loop
// protection (a persistently-stale proxy re-offers the same buildId, which we
// have already attempted, so we stop) while still letting each genuinely new
// deploy get exactly one recovery attempt.
;(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    const { buildId } = await res.json()
    if (!buildId || !window.__BUILD_ID__ || buildId === window.__BUILD_ID__) return
    if (sessionStorage.getItem('ilab_update_reload_to') === buildId) return
    sessionStorage.setItem('ilab_update_reload_to', buildId)
    // set(), not append — the old code concatenated a fresh _v= on every
    // recovery, so a tab that survived several deploys accumulated
    // ?_v=a&_v=b&_v=c… without bound.
    const url = new URL(window.location.href)
    url.searchParams.set('_v', buildId)
    window.location.replace(url.toString())
  } catch {}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
