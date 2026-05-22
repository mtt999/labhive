import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { sb } from './lib/supabase'
import Login from './screens/auth/Login'
import AdminLogin from './screens/auth/AdminLogin'
import Layout from './components/Layout'
import Dashboard from './screens/dashboard/Dashboard'
import REMessages from './screens/messaging/REMessages'
import Home from './screens/inspection/Home'
import Inspection from './screens/inspection/Inspection'
import Results from './screens/inspection/Results'
import Projects from './screens/projects/Projects'
import ProjectMaterial from './screens/projects/ProjectMaterial'
import ProjectDetail from './screens/projects/ProjectDetail'
import History from './screens/inspection/History'
import TrainingRecords from './screens/training/TrainingRecords'
import Profile from './screens/profile/Profile'
import EquipmentInventory from './screens/equipment/EquipmentInventory'
import EquipmentHub from './screens/equipment/EquipmentHub'
import BookingEquipment from './screens/equipment/BookingEquipment'
import PM from './screens/maintenance/PM'
import Toast from './components/Toast'
import DashboardIconPicker from './components/DashboardIconPicker'
import ForcePasswordChange from './components/ForcePasswordChange'
import BarcodeScannerScreen from './screens/barcode/BarcodeScannerScreen'
import BarcodeManager from './screens/barcode/BarcodeManager'
import EquipmentScan from './screens/equipment/EquipmentScan'
import Admin from './screens/admin/Admin'
import { isNative } from './lib/scanner.js'

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

// Detect equipment scan from QR code: ?eq=<uuid>
const SCAN_EQ_ID = new URLSearchParams(window.location.search).get('eq')

// Deep-link from email notifications: ?screen=booking&tab=team etc.
const DEEP_LINK_SCREEN = new URLSearchParams(window.location.search).get('screen')
const DEEP_LINK_TAB    = new URLSearchParams(window.location.search).get('tab')

export default function App() {
  const { session, screen, refreshCache, setScreen, setActiveModules, setScanEquipmentId, setSession, setSharedWorkspaces } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [userAccess, setUserAccess] = useState(null)
  const [showIconPicker, setShowIconPicker] = useState(null)

  // Store the equipment ID from the QR code URL param so Login can redirect after auth
  useEffect(() => {
    if (SCAN_EQ_ID) setScanEquipmentId(SCAN_EQ_ID)
  }, [])

  // Native deep-link: ilab://?eq=<uuid> — fired when iOS opens the app via QR code URL scheme
  useEffect(() => {
    if (!isNative()) return
    let listenerHandle
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appUrlOpen', ({ url }) => {
        let eq = null
        try {
          eq = new URL(url).searchParams.get('eq')
        } catch {
          eq = new URLSearchParams((url.split('?')[1]) || '').get('eq')
        }
        if (!eq) return
        setScanEquipmentId(eq)
        if (useAppStore.getState().session) setScreen('equipmentscan')
      }).then(h => { listenerHandle = h })
    })
    return () => { listenerHandle?.remove() }
  }, [])

  async function restoreSessionFromAuth(authUser) {
    const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
    if (saRow?.value === authUser.id) {
      setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
      return
    }
    const { data: teamUser } = await sb.from('users').select('*').eq('auth_id', authUser.id).eq('is_active', true).maybeSingle()
    if (teamUser) {
      const adminLevel = teamUser.admin_level || 0
      const role = teamUser.role === 'admin' || adminLevel >= 1 ? 'admin' : teamUser.role
      setSession({ role, dbRole: teamUser.role, username: teamUser.name, userId: teamUser.id, email: teamUser.email, adminLevel, photoUrl: teamUser.photo_url, avatar: teamUser.avatar, loginMode: 'team', organizationId: teamUser.organization_id || null, projectGroup: teamUser.project_group || null, mustChangePassword: teamUser.must_change_password === true })
      return
    }
    const { data: soloUser } = await sb.from('solo_users').select('*').eq('auth_id', authUser.id).maybeSingle()
    if (soloUser) {
      setSession({ role: 'solo', username: soloUser.name, userId: soloUser.id, email: soloUser.email, photoUrl: soloUser.photo_url, avatar: soloUser.avatar, activeModules: soloUser.active_modules || [], loginMode: 'solo' })
      sb.from('solo_workspace_members').select('owner_id').eq('member_id', soloUser.id)
        .then(({ data: memberships }) => {
          if (memberships?.length) {
            const ownerIds = memberships.map(m => m.owner_id)
            sb.from('solo_users').select('id, name').in('id', ownerIds)
              .then(({ data: owners }) => setSharedWorkspaces((owners || []).map(o => ({ ownerId: o.id, ownerName: o.name }))))
          }
        })
    }
  }

  useEffect(() => {
    async function init() {
      const { data: { session: authSession } } = await sb.auth.getSession()
      if (authSession?.user) await restoreSessionFromAuth(authSession.user)
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
      // QR scan takes priority
      if (SCAN_EQ_ID) { setScreen('equipmentscan'); return }
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
    }
  }, [session])

  useEffect(() => {
    if (!session?.loginMode) return
    checkFirstLogin(session.userId, session.loginMode)
  }, [session?.loginMode, session?.userId])

  async function checkFirstLogin(userId, loginMode) {
    try {
      // Don't interrupt with the icon picker when the user arrived via a QR scan
      if (SCAN_EQ_ID) { setShowIconPicker(false); return }
      if (!userId) {
        // Super admin: never show icon picker — they only use the Admin Panel
        setShowIconPicker(false)
        return
      }
      if (loginMode === 'solo') {
        const { data } = await sb.from('solo_users').select('active_modules').eq('id', userId).limit(1)
        const row = data?.[0]
        // Show picker only if user has never saved any modules (no row or null/empty array)
        const hasSaved = row && Array.isArray(row.active_modules) && row.active_modules.length > 0
        setShowIconPicker(!hasSaved)
      } else {
        const { data } = await sb.from('user_dashboard_prefs').select('active_modules, has_set_dashboard').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
        const row = data?.[0]
        const hasSaved = row && (
          (Array.isArray(row.active_modules) && row.active_modules.length > 0) ||
          row.has_set_dashboard === true
        )
        setShowIconPicker(!hasSaved)
      }
    } catch (e) {
      setShowIconPicker(false)
    }
  }

  useEffect(() => {
    if (session?.userId && (session?.role === 'user' || session?.role === 'admin' || session?.role === 'student')) {
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
    if (session?.role === 'student') {
      const baseAllowed = ['dashboard', 'projects', 'project-detail', 'training', 'profile', 'equipmenthub', 'booking', 'remessages', 'barcode', 'barcodeqr', 'equipmentscan', 'home', 'equipment', 'pm', 'history']
      if (!baseAllowed.includes(screen) && !(userAccess && userAccess.has(screen))) setScreen('dashboard')
    }
    // equipmentscan, barcodeqr, barcode, home, equipment bypass per-user access control
    const INTERNAL = new Set(['dashboard', 'profile', 'inspection', 'results', 'project-detail', 'pm', 'barcode', 'equipmentscan', 'barcodeqr', 'orgadmin', 'home', 'equipment', 'projects', 'training', 'history', 'equipmenthub', 'booking', 'remessages'])
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

  // Admin-only route: /ilab/admin
  if (IS_ADMIN_ROUTE) {
    if (!session || session.role !== 'admin') return <AdminLogin />
  }

  if (!session) return <Login />

  const screens = {
    dashboard: <Dashboard />,
    home: <Home />,
    inspection: <Inspection />,
    results: <Results />,
    projects: <ProjectMaterial />,
    'project-detail': <ProjectDetail />,
    history: <History />,
    training: <TrainingRecords />,
    profile: <Profile />,
    equipment: <EquipmentInventory />,
    equipmenthub: <EquipmentHub />,
    booking: <BookingEquipment />,
    remessages: <REMessages />,
    pm: <PM />,
    barcode: <BarcodeScannerScreen />,
    barcodeqr: <BarcodeManager />,
    equipmentscan: <EquipmentScan />,
    orgadmin: <Admin />,
  }

  return (
    <>
      <Layout>{screens[screen] || <Dashboard />}</Layout>
      <Toast />
      {session?.mustChangePassword && <ForcePasswordChange />}
      {showIconPicker === true && (
        <DashboardIconPicker
          session={session}
          loginMode={session.loginMode}
          onDone={(modules) => {
            if (!session.userId) {
              localStorage.setItem('ilab_admin_dashboard_set', 'true')
            } else if (!modules || modules.length === 0) {
              // Dismissed or no icons assigned — mark as seen so picker doesn't reappear
              if (session.loginMode === 'solo') {
                sb.from('solo_users').update({ has_set_dashboard: true }).eq('id', session.userId).then(() => {})
              } else {
                sb.from('user_dashboard_prefs').select('id').eq('user_id', session.userId).limit(1)
                  .then(({ data }) => {
                    if (data?.length) {
                      sb.from('user_dashboard_prefs').update({ has_set_dashboard: true }).eq('user_id', session.userId).then(() => {})
                    } else {
                      sb.from('user_dashboard_prefs').insert({ user_id: session.userId, has_set_dashboard: true, active_modules: [] }).then(() => {})
                    }
                  })
              }
            }
            if (modules !== null && modules !== undefined) setActiveModules(modules)
            setShowIconPicker(false)
          }}
        />
      )}
    </>
  )
}
