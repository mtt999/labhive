import { useEffect, useState, useRef, lazy, Suspense, Component } from 'react'
import { useAppStore } from './store/useAppStore'
import { sb } from './lib/supabase'
import { isPublicDemo } from './lib/demoMode'

class ScreenErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) {
    console.error('Screen render error:', error, info)
    import('./lib/logAdminError').then(({ logAdminError }) =>
      logAdminError('Screen render error', `${error?.message}\n${info?.componentStack?.slice(0, 400)}`)
    )
  }
  render() {
    if (this.state.hasError) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', padding:32, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:20, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Something went wrong</div>
        <div style={{ fontSize:14, color:'var(--text3)', marginBottom:24, maxWidth:360, lineHeight:1.6 }}>
          This page had an error. Your data is safe — go back to the dashboard and try again.
        </div>
        <button onClick={() => { this.setState({ hasError:false }); useAppStore.getState().setScreen('dashboard') }}
          style={{ padding:'10px 24px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:600, cursor:'pointer' }}>
          ← Back to Dashboard
        </button>
      </div>
    )
    return this.props.children
  }
}
import Login from './screens/auth/Login'
import AdminLogin from './screens/auth/AdminLogin'
import Layout from './components/Layout'
import Toast from './components/Toast'
import DashboardIconPicker from './components/DashboardIconPicker'
import ForcePasswordChange from './components/ForcePasswordChange'
import { isNative } from './lib/scanner.js'
import { providers as storageProviders } from './lib/storage/StorageService'
import { logAdminError } from './lib/logAdminError'
import CustomerServiceModal from './components/CustomerServiceModal'
import TermsAcceptance from './components/TermsAcceptance'
import { CURRENT_TERMS_VERSION } from './lib/termsVersion'
import CookieConsent from './components/CookieConsent'

// Route-level code splitting: every screen is its own lazy chunk, so the
// initial download is only the core app + login. The obfuscator's
// reservedStrings ('^\./', '^\.\./') MUST keep these specifiers intact or
// Rollup emits no chunks (see "Build — obfuscator vs dynamic imports").
const Dashboard            = lazy(() => import('./screens/dashboard/Dashboard'))
const LabMessage           = lazy(() => import('./screens/messaging/LabMessage'))
const Home                 = lazy(() => import('./screens/inspection/Home'))
const Inspection           = lazy(() => import('./screens/inspection/Inspection'))
const Results              = lazy(() => import('./screens/inspection/Results'))
const ProjectMaterial      = lazy(() => import('./screens/projects/ProjectMaterial'))
const History              = lazy(() => import('./screens/inspection/History'))
const TrainingRecords      = lazy(() => import('./screens/training/TrainingRecords'))
const TrainingRecordsProto = lazy(() => import('./screens/training/TrainingRecordsProto'))
const LayoutProto          = lazy(() => import('./screens/proto/LayoutProto'))
const Profile              = lazy(() => import('./screens/profile/Profile'))
const EquipmentInventory   = lazy(() => import('./screens/equipment/EquipmentInventory'))
const EquipmentHub         = lazy(() => import('./screens/equipment/EquipmentHub'))
const BookingEquipment     = lazy(() => import('./screens/equipment/BookingEquipment'))
const PM                   = lazy(() => import('./screens/maintenance/PM'))
const BarcodeManager       = lazy(() => import('./screens/barcode/BarcodeManager'))
const EquipmentScan        = lazy(() => import('./screens/equipment/EquipmentScan'))
const Admin                = lazy(() => import('./screens/admin/Admin'))
const LabManagement        = lazy(() => import('./screens/labmanagement/LabManagement'))

window.addEventListener('error', (e) => {
  logAdminError(`JS Error: ${e.message}`, `${e.filename}:${e.lineno}`)
})
// An unhandled rejection means, by definition, that no call site caught it —
// so nothing has told the user. Previously this only logged to the super-admin
// bell, leaving the user staring at a button that silently did nothing (a
// failed export, a save that threw). Toast it as well; there is no
// double-message risk precisely because it is unhandled.
let lastRejectionMsg = ''
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason) || 'Unhandled promise rejection'
  logAdminError(`Promise Error: ${msg}`, e.reason?.stack?.split('\n')[1]?.trim() || '')
  // A failed lazy chunk is already handled by the vite:preloadError reload in
  // main.jsx — toasting it too would just add noise mid-recovery.
  if (/dynamically imported module|Importing a module script failed|Load failed/i.test(msg)) return
  if (msg === lastRejectionMsg) return          // collapse identical repeats
  lastRejectionMsg = msg
  setTimeout(() => { lastRejectionMsg = '' }, 4000)
  try { useAppStore.getState().toast(`Something didn't complete: ${msg}`, true) } catch {}
})

if (isNative()) {
  import('@basecom-gmbh/capacitor-jailbreak-root-detection').then(({ JailbreakRootDetection }) => {
    JailbreakRootDetection.isJailbrokenOrRooted().then(({ result }) => {
      if (result) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:32px"><p>This app cannot run on a jailbroken device.</p></div>'
      }
    }).catch(() => {})
  }).catch(() => {})
}

// Detect if we're on the /admin route
const IS_ADMIN_ROUTE = window.location.pathname.endsWith('/admin') || window.location.pathname.endsWith('/admin/')

// Detect QR scan: equipment (?eq=<uuid>) or material/item (?item=<name>)
const SCAN_EQ_ID   = new URLSearchParams(window.location.search).get('eq')
const SCAN_ITEM_QR = new URLSearchParams(window.location.search).get('item')

// Deep-link from email notifications: ?screen=booking&tab=team etc.
const DEEP_LINK_SCREEN = new URLSearchParams(window.location.search).get('screen')
const DEEP_LINK_TAB    = new URLSearchParams(window.location.search).get('tab')

function ComingSoonScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0F1B35', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <img src={`${import.meta.env.BASE_URL}labhive-icon.png`} alt="LabHive" onError={e => { e.target.style.display='none' }}
        style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }} />
      <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>Coming Soon</div>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 340, lineHeight: 1.6, marginBottom: 32 }}>
        We're making some improvements. The app will be back shortly.
      </div>
      <a href="/admin" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', marginTop: 16, fontFamily: 'monospace' }}>
        admin
      </a>
    </div>
  )
}

export default function App() {
  const { session, screen, refreshCache, setScreen, setActiveModules, setScanEquipmentId, setSession, setSharedWorkspaces, clearSession } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [userAccess, setUserAccess] = useState(null)
  const [showIconPicker, setShowIconPicker] = useState(null)
  // Once the user dismisses the picker (via Save or ×), this ref prevents any
  // async DB re-check from re-opening it within the same session.
  const pickerDismissedRef = useRef(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [showSupport, setShowSupport] = useState(() => new URLSearchParams(window.location.search).get('support') === '1')
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Check terms version on every login — super admin is exempt
  useEffect(() => {
    if (!session) { setTermsAccepted(false); return }
    if (session.userId === null) { setTermsAccepted(true); return } // super admin
    setTermsAccepted(session.termsAcceptedVersion === CURRENT_TERMS_VERSION)
  }, [session?.userId, session?.termsAcceptedVersion])

  // Track screen changes as GA4 page views
  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_title: screen,
        page_location: window.location.href,
        page_path: '/' + screen,
      })
    }
  }, [screen])

  // Store the equipment ID from the QR code URL param so Login can redirect after auth
  useEffect(() => {
    if (SCAN_EQ_ID) setScanEquipmentId(SCAN_EQ_ID)
  }, [])

  // Web OAuth callback: when Google/OneDrive redirects back to the SPA with ?code=&state=
  useEffect(() => {
    if (isNative()) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    const state = params.get('state')
    if ((code || error) && (state === 'gdrive' || state === 'onedrive')) {
      window.history.replaceState({}, '', window.location.pathname)
      if (error) {
        const label = state === 'gdrive' ? 'Google Drive' : 'OneDrive'
        const desc = params.get('error_description') || error
        useAppStore.getState().toast(`${label} sign-in failed: ${desc}`)
        return
      }
      ;(async () => {
        try {
          await storageProviders[state].handleCallback(code)
          useAppStore.getState().setStorageProviderKey(state)
          setTimeout(() => window.dispatchEvent(new CustomEvent('ilab:storage-connected', { detail: { key: state } })), 0)
          localStorage.removeItem('ilab_oauth_error')
          useAppStore.getState().toast(`${state === 'gdrive' ? 'Google Drive' : 'OneDrive'} connected ✓`)
        } catch (e) {
          const msg = (e.message || 'Unknown error')
          localStorage.setItem('ilab_oauth_error', `${state}: ${msg}`)
          useAppStore.getState().toast('Storage connection failed: ' + msg, 8000)
        }
      })()
    }
  }, [])

  // Native deep-link: handles QR scan (ilab://?eq=<uuid>) and OAuth callbacks (ilab://oauth-callback?code=...&state=gdrive|onedrive)
  useEffect(() => {
    if (!isNative()) return
    let listenerHandle
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        let params
        try { params = new URL(url).searchParams }
        catch { params = new URLSearchParams((url.split('?')[1]) || '') }

        // OAuth callback from Google Drive or OneDrive
        const code = params.get('code')
        const state = params.get('state')
        if (code && (state === 'gdrive' || state === 'onedrive')) {
          try {
            import('@capacitor/browser').then(({ Browser }) => Browser.close().catch(() => {}))
            await storageProviders[state].handleCallback(code)
            useAppStore.getState().setStorageProviderKey(state)
            window.dispatchEvent(new CustomEvent('ilab:storage-connected', { detail: { key: state } }))
            useAppStore.getState().toast(`${state === 'gdrive' ? 'Google Drive' : 'OneDrive'} connected ✓`)
          } catch (e) {
            useAppStore.getState().toast('Storage connection failed: ' + (e.message || ''))
          }
          return
        }

        // QR scan
        const eq = params.get('eq')
        if (!eq) return
        setScanEquipmentId(eq)
        if (useAppStore.getState().session) setScreen('equipmentscan')
      }).then(h => { listenerHandle = h })
    })
    return () => { listenerHandle?.remove() }
  }, [])

  function applyRestoredTeamSession(teamUser) {
    const adminLevel = teamUser.admin_level || 0
    const role = teamUser.role === 'admin' || adminLevel >= 1 ? 'admin' : teamUser.role
    const isDemo = isPublicDemo(teamUser.email)
    localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'team', id: teamUser.id }))
    setSession({ role, dbRole: teamUser.role, username: teamUser.nick_name?.trim() || teamUser.name, userId: teamUser.id, email: teamUser.email, adminLevel, photoUrl: teamUser.photo_url, avatar: teamUser.avatar, loginMode: 'team', organizationId: teamUser.organization_id || null, projectGroup: teamUser.project_group || null, mustChangePassword: teamUser.must_change_password === true, termsAcceptedVersion: isDemo ? null : (teamUser.terms_accepted_version || null), tourDone: isDemo ? false : (teamUser.tour_done === true), pickerDone: isDemo ? false : (teamUser.picker_done === true), isDemo })
  }

  function applyRestoredSoloSession(soloUser) {
    const isDemo = isPublicDemo(soloUser.email)
    localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'solo', id: soloUser.id }))
    setSession({ role: 'solo', username: soloUser.nick_name?.trim() || soloUser.name, userId: soloUser.id, email: soloUser.email, photoUrl: soloUser.photo_url, avatar: soloUser.avatar, activeModules: soloUser.active_modules || [], loginMode: 'solo', termsAcceptedVersion: isDemo ? null : (soloUser.terms_accepted_version || null), isPaid: soloUser.is_paid || false, tourDone: isDemo ? false : (soloUser.tour_done === true), pickerDone: isDemo ? false : (soloUser.picker_done === true), isDemo })
    sb.from('solo_workspace_members').select('owner_id').eq('member_id', soloUser.id)
      .then(({ data: memberships }) => {
        if (memberships?.length) {
          const ownerIds = memberships.map(m => m.owner_id)
          sb.from('solo_users').select('id, name').in('id', ownerIds)
            .then(({ data: owners }) => setSharedWorkspaces((owners || []).map(o => ({ ownerId: o.id, ownerName: o.name }))))
        }
      })
  }

  async function restoreSessionFromAuth(authUser) {
    const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
    const isSuperAdmin = saRow?.value === authUser.id

    // Prefer the exact identity chosen at login. A single auth_id can map to
    // MULTIPLE `users` rows (demo's Manager + Lab User share one auth_id, and
    // an org admin can be added as another role too) — without this, a hard
    // refresh can't tell which one was active and .maybeSingle() below would
    // error on 2+ rows, silently falling through to the wrong account type.
    let stored = null
    try { stored = JSON.parse(localStorage.getItem('ilab_active_identity') || 'null') } catch {}

    if (stored?.kind === 'admin' && isSuperAdmin) {
      localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'admin' }))
      setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      return
    }
    if (stored?.kind === 'team' && stored.id) {
      const { data: teamUser } = await sb.from('users').select('*').eq('id', stored.id).eq('auth_id', authUser.id).eq('is_active', true).maybeSingle()
      if (teamUser) { applyRestoredTeamSession(teamUser); return }
    }
    if (stored?.kind === 'solo' && stored.id) {
      const { data: soloUser } = await sb.from('solo_users').select('*').eq('id', stored.id).eq('auth_id', authUser.id).maybeSingle()
      if (soloUser) { applyRestoredSoloSession(soloUser); return }
    }

    // No stored identity, or the stored row is gone/deactivated — fall back
    // to auto-detection. Ordered + limited to 1 so an ambiguous multi-row
    // account never errors; it just deterministically picks one and persists
    // it via applyRestoredTeamSession so future refreshes stay consistent.
    if (isSuperAdmin) {
      setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'admin' }))
      return
    }
    const { data: teamUsers } = await sb.from('users').select('*').eq('auth_id', authUser.id).eq('is_active', true).order('id').limit(1)
    if (teamUsers?.length) { applyRestoredTeamSession(teamUsers[0]); return }

    const { data: soloUser } = await sb.from('solo_users').select('*').eq('auth_id', authUser.id).maybeSingle()
    if (soloUser) applyRestoredSoloSession(soloUser)
  }

  useEffect(() => {
    async function init() {
      const [{ data: { session: authSession } }, { data: maintRow }] = await Promise.all([
        sb.auth.getSession(),
        sb.from('settings').select('value').eq('key', 'maintenance_mode').maybeSingle(),
      ])
      if (maintRow?.value === 'true') setMaintenanceMode(true)
      if (authSession?.user) {
        await restoreSessionFromAuth(authSession.user)
        // Clear demo-user localStorage flags on every page load so restrictions apply fresh
        if (authSession.user.email?.toLowerCase() === 'demo@labhive.app') {
          Object.keys(localStorage)
            .filter(k => k.startsWith('ilab_tour') || k.startsWith('ilab_login_count') || k.startsWith('ilab_tip') || k.startsWith('ilab_picker_done'))
            .forEach(k => localStorage.removeItem(k))
        }
      }
      const loginMode = localStorage.getItem('ilab_login_mode')
      const done = () => {
        setLoading(false)
        if (isNative()) import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide()).catch(() => {})
      }
      if (loginMode === 'solo') {
        done()
      } else {
        const timeout = new Promise(resolve => setTimeout(resolve, 8000))
        Promise.race([refreshCache(), timeout]).finally(done)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (session?.loginMode) {
      localStorage.setItem('ilab_login_mode', session.loginMode)
      // Re-sync the rooms/supplies cache now that we have the correct org in session
      refreshCache()
      // QR scan takes priority (equipment ?eq= or material/item ?item=)
      if (SCAN_EQ_ID || SCAN_ITEM_QR) { setScreen('equipmentscan'); return }
      // Deep-link from email notification
      if (DEEP_LINK_SCREEN) {
        if (DEEP_LINK_TAB === 'team') {
          const { setPendingProfileTab } = useAppStore.getState()
          setPendingProfileTab('team')
        }
        setScreen(DEEP_LINK_SCREEN)
      }
    } else if (!session) {
      localStorage.removeItem('ilab_login_mode')
      setShowIconPicker(null)
      setActiveModules(null)
      pickerDismissedRef.current = false
    }
  }, [session])

  useEffect(() => {
    if (!session?.loginMode) return
    // Reset picker guard when user/role changes (e.g. switching demo roles without logout)
    pickerDismissedRef.current = false
    // Demo: always reset activeModules so loadDashboardPrefs doesn't early-return on a stale
    // non-null value left over from a previous role in the same browser session
    if (session?.isDemo) setActiveModules(null)
    checkFirstLogin(session.userId, session.loginMode)
  }, [session?.loginMode, session?.userId])

  async function checkFirstLogin(userId, loginMode) {
    try {
      // Don't interrupt with the icon picker when the user arrived via a QR scan
      if (SCAN_EQ_ID || SCAN_ITEM_QR) { setShowIconPicker(false); return }
      // Picker was already dismissed this session — never re-open it
      if (pickerDismissedRef.current) { setShowIconPicker(false); return }
      // Demo account always sees the picker on login (localStorage/DB checks skipped)
      if (useAppStore.getState().session?.isDemo) { setShowIconPicker(true); return }
      if (!userId) {
        // Super admin: show picker only if they haven't set their dashboard yet
        if (localStorage.getItem('ilab_admin_dashboard_set') === 'true') { setShowIconPicker(false); return }
        setShowIconPicker(false)
        return
      }
      // Fast path: picker already dismissed in this browser (set synchronously by onDone)
      if (localStorage.getItem(`ilab_picker_done_${userId}`) === 'true') { setShowIconPicker(false); return }
      // Fast path: picker_done flag from session (device-agnostic DB field)
      if (useAppStore.getState().session?.pickerDone) { setShowIconPicker(false); return }
      if (loginMode === 'solo') {
        const { data } = await sb.from('solo_users').select('active_modules').eq('id', userId).limit(1)
        const row = data?.[0]
        // Show picker only if user has never saved any modules (no row or null/empty array)
        const hasSaved = row && Array.isArray(row.active_modules) && row.active_modules.length > 0
        setShowIconPicker(!hasSaved)
      } else {
        const { data } = await sb.from('user_dashboard_prefs').select('active_modules, has_set_dashboard').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
        const row = data?.[0]
        // Any explicit active_modules array (even empty) means already configured
        const hasSaved = row && (
          row.has_set_dashboard === true ||
          Array.isArray(row.active_modules)
        )
        setShowIconPicker(!hasSaved)
      }
    } catch (e) {
      setShowIconPicker(false)
    }
  }

  // In-app review prompt: trigger after 5th login, then once every 30 days
  useEffect(() => {
    if (!session?.userId || !isNative()) return
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    const count = parseInt(localStorage.getItem('ilab_app_opens') || '0') + 1
    const lastReview = parseInt(localStorage.getItem('ilab_last_review') || '0')
    localStorage.setItem('ilab_app_opens', count)
    const dueForReview = count === 5 || (count > 5 && Date.now() - lastReview > THIRTY_DAYS)
    if (dueForReview) {
      import('capacitor-rate-app').then(({ RateApp }) => {
        RateApp.requestReview().catch(() => {})
        localStorage.setItem('ilab_last_review', Date.now())
      }).catch(() => {})
    }
  }, [session?.userId])

  // Super admin idle timeout: sign out after 30 minutes of inactivity
  useEffect(() => {
    if (!session || session.userId !== null) return
    const IDLE_MS = 30 * 60 * 1000
    let lastActivity = Date.now()
    const touch = () => { lastActivity = Date.now() }
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(ev => window.addEventListener(ev, touch, { passive: true }))
    const interval = setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS) clearSession()
    }, 60_000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, touch))
      clearInterval(interval)
    }
  }, [session?.userId])

  useEffect(() => {
    if (session?.userId && (session?.role === 'user' || session?.role === 'admin' || session?.role === 'lab_user')) {
      sb.from('user_screen_access').select('screen_key').eq('user_id', session.userId)
        .then(({ data }) => {
          if (data?.length) setUserAccess(new Set(data.map(r => r.screen_key)))
          else setUserAccess(null)
        })
        .catch(() => setUserAccess(null))
    } else {
      setUserAccess(null)
    }
  }, [session?.userId])

  useEffect(() => {
    // Super admin (no userId): can only access dashboard, orgadmin, and profile
    if (session?.role === 'admin' && !session?.userId) {
      if (!['dashboard', 'orgadmin', 'profile'].includes(screen)) setScreen('dashboard')
      return
    }
    // Public demo visitors get no admin panel — hidden on the dashboard and
    // unreachable by typing the screen key or a ?screen=orgadmin deep link.
    if (session?.isDemo && screen === 'orgadmin') { setScreen('dashboard'); return }
    if (session?.role === 'lab_user') {
      const baseAllowed = ['dashboard', 'projects', 'training', 'profile', 'equipmenthub', 'booking', 'remessages', 'barcodeqr', 'equipmentscan', 'home', 'equipment', 'pm', 'history', 'training-proto', 'layout-proto']
      if (!baseAllowed.includes(screen) && !(userAccess && userAccess.has(screen))) setScreen('dashboard')
    }
    // equipmentscan, barcodeqr, home, equipment bypass per-user access control
    const INTERNAL = new Set(['dashboard', 'profile', 'inspection', 'results', 'pm', 'equipmentscan', 'barcodeqr', 'orgadmin', 'home', 'equipment', 'projects', 'training', 'training-proto', 'layout-proto', 'history', 'equipmenthub', 'booking', 'remessages', 'labmanagement'])
    if ((session?.role === 'user' || session?.role === 'admin') && userAccess && !INTERNAL.has(screen)) {
      if (!userAccess.has(screen)) setScreen('dashboard')
    }
  }, [session, screen, userAccess])

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 999 }}>
      <div className="spinner" />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>Connecting to database…</div>
    </div>
  )

  // Maintenance mode: show Coming Soon to everyone except super admin and the /admin route
  if (maintenanceMode && !IS_ADMIN_ROUTE && session?.userId !== null) {
    return <ComingSoonScreen />
  }

  // Admin-only route: /ilab/admin
  if (IS_ADMIN_ROUTE) {
    if (!session || session.role !== 'admin') return <AdminLogin />
  }

  // Public QR scan — show the 5-box scan page without requiring login
  if (!session && (SCAN_EQ_ID || SCAN_ITEM_QR)) {
    return (
      <Suspense fallback={
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexDirection: 'column' }}>
          <div className="spinner" />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>Loading…</div>
        </div>
      }>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 40px' }}>
          <EquipmentScan />
        </div>
      </Suspense>
    )
  }

  if (!session) return (
    <>
      <Login />
      {showSupport && <CustomerServiceModal onClose={() => setShowSupport(false)} />}
      <CookieConsent />
    </>
  )

  const screens = {
    dashboard: <Dashboard />,
    home: <Home />,
    inspection: <Inspection />,
    results: <Results />,
    projects: <ProjectMaterial />,
    history: <History />,
    training: <TrainingRecords />,
    'training-proto': <TrainingRecordsProto />,
    'layout-proto': <LayoutProto />,
    profile: <Profile />,
    equipment: <EquipmentInventory />,
    equipmenthub: <EquipmentHub />,
    booking: <BookingEquipment />,
    remessages: <LabMessage />,
    pm: <PM />,
    barcodeqr: <BarcodeManager />,
    equipmentscan: <EquipmentScan />,
    orgadmin: <Admin />,
    labmanagement: <LabManagement />,
  }

  return (
    <>
      <Layout>
        <ScreenErrorBoundary key={screen}>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>}>
            {screens[screen] || <Dashboard />}
          </Suspense>
        </ScreenErrorBoundary>
      </Layout>
      <Toast />
      {!termsAccepted && session && <TermsAcceptance session={session} onAccept={() => setTermsAccepted(true)} />}
      {termsAccepted && session?.mustChangePassword && <ForcePasswordChange />}
      {showSupport && <CustomerServiceModal onClose={() => setShowSupport(false)} />}
      <CookieConsent />
      {showIconPicker === true && (
        <DashboardIconPicker
          session={session}
          loginMode={session.loginMode}
          onDone={(modules) => {
            // Mark dismissed immediately — prevents any async DB re-check from re-opening
            pickerDismissedRef.current = true
            if (!session.userId) {
              localStorage.setItem('ilab_admin_dashboard_set', 'true')
            } else if (!session.isDemo) {
              // Skip localStorage/DB flags for demo — next login should show picker again
              localStorage.setItem(`ilab_picker_done_${session.userId}`, 'true')
              if (session.loginMode === 'solo') {
                sb.from('solo_users').update({ picker_done: true }).eq('id', session.userId).then(() => {}, () => {})
              } else {
                sb.from('users').update({ picker_done: true }).eq('id', session.userId).then(() => {}, () => {})
              }
            }
            if (modules?.length > 0) setActiveModules(modules)
            setShowIconPicker(false)
          }}
        />
      )}
    </>
  )
}
