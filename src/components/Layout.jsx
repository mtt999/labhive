import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import NotificationBell from './NotificationBell'
import SuperAdminBell from './SuperAdminBell'

export function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ── Mobile bottom nav tabs ──────────────────────────────────────
const NAV_TABS = [
  { id: 'home',     icon: '🏠', label: 'Home',     screens: ['dashboard'] },
  { id: 'booking',  icon: '📅', label: 'Booking',  screens: ['booking', 'equipmentscan'] },
  { id: 'messages', icon: '💬', label: 'Messages', screens: ['remessages'] },
  { id: 'projects', icon: '🗂️', label: 'Projects', screens: ['projects', 'project-detail'] },
  { id: 'profile',  icon: '👤', label: 'Profile',  screens: ['profile'] },
]

// ── Module icon/label lookup for sidebar ───────────────────────
const MODULE_META = {
  home:             { icon: '🔍', label: 'Inspections' },
  inspection:       { icon: '🔍', label: 'Inspections' },
  results:          { icon: '🔍', label: 'Inspections' },
  history:          { icon: '🔍', label: 'Inspections' },
  equipment:        { icon: '🔧', label: 'Equipment' },
  equipmenthub:     { icon: '📖', label: 'Equipment Hub' },
  equipmentscan:    { icon: '📷', label: 'Equipment Scan' },
  booking:          { icon: '📅', label: 'Booking' },
  training:         { icon: '📚', label: 'Training Records' },
  projects:         { icon: '🧪', label: 'Project Workspace' },
  'project-detail': { icon: '🧪', label: 'Project Workspace' },
  remessages:       { icon: '💬', label: 'Lab Messages' },
  pm:               { icon: '📋', label: 'Task Board' },
  barcodeqr:        { icon: '🔲', label: 'QR Labels' },
  barcode:          { icon: '📷', label: 'Barcode Scanner' },
  labmanagement:    { icon: '⚙️', label: 'Lab Management' },
  orgadmin:         { icon: '🔑', label: 'Admin Panel' },
  profile:          { icon: '👤', label: 'Profile' },
}

// ── Sidebar sub-tab definitions per screen ─────────────────────
function getScreenTabs(screen, session) {
  const isSolo    = session?.loginMode === 'solo'
  const isStudent = session?.role === 'student'
  const isAdmin   = session?.role === 'admin' || session?.userId === null
  const isStaff   = session?.role === 'user'

  if (screen === 'training') return [
    { key: 'fresh',     icon: '📄', label: 'Lab User Documents' },
    ...(!isSolo ? [{ key: 'golf',  icon: '🚗', label: 'Vehicle' }] : []),
    { key: 'equipment', icon: '🔧', label: 'Equipment' },
    ...(!isSolo ? [{ key: 'alarm', icon: '🔔', label: 'Building Alarm' }] : []),
    ...((isAdmin || isStaff) ? [{ key: 'requests', icon: '📋', label: 'Training Requests' }] : []),
    ...(!isSolo ? [{ key: 'exam',   icon: '📝', label: 'Exam' }] : []),
    ...(!isSolo ? [{ key: 'locker', icon: '🗄️', label: 'Lab User Locker' }] : []),
  ]

  if (screen === 'equipment') return [
    { key: 'list',        icon: '📋', label: 'List of Equipment' },
    ...((isAdmin || isStaff) ? [
      { key: 'calibration', icon: '🧪', label: 'Calibration' },
      { key: 'records',     icon: '📊', label: 'Maintenance Records' },
    ] : []),
    { key: 'settings',    icon: '⚙️', label: 'Settings' },
  ]

  if (screen === 'projects') {
    const hasProjectAccess = isSolo || !isStudent
    return [
      { key: 'inventory', icon: '📦', label: 'Material Inventory' },
      ...(hasProjectAccess ? [
        { key: 'results',   icon: '✏️',  label: 'Project Test Results' },
        { key: 'workspace', icon: '📋', label: 'Workspace' },
      ] : []),
    ]
  }

  if (screen === 'pm') return [
    { key: 'overview',  icon: '📊', label: 'Overview' },
    { key: 'tasks',     icon: '✅', label: 'My Tasks' },
    ...(!isSolo ? [{ key: 'team', icon: '👥', label: 'Team' }] : []),
    { key: 'calendar',  icon: '📅', label: 'Calendar' },
    ...(!isSolo ? [{ key: 'meetings', icon: '🤝', label: 'Meetings' }] : []),
    { key: 'reminder',  icon: '⏰', label: 'Reminders' },
    ...(isAdmin ? [{ key: 'assign', icon: '📌', label: 'Assign Others' }] : []),
  ]

  if (screen === 'barcodeqr') return [
    { key: 'equipment', icon: '🔲', label: 'Equipment Barcode' },
    { key: 'records',   icon: '📋', label: 'Records' },
    { key: 'materials', icon: '📷', label: 'Project Materials' },
  ]

  if (screen === 'home') {
    const canManage = session?.role === 'admin' || session?.role === 'user' || session?.loginMode === 'solo'
    return [
      { key: 'inspect',  icon: '🔍', label: 'Inspection' },
      { key: 'export',   icon: '📊', label: 'Export Data' },
      ...(canManage ? [
        { key: 'rooms',    icon: '🏠', label: 'Rooms' },
        { key: 'supplies', icon: '📦', label: 'Supplies' },
        { key: 'import',   icon: '📥', label: 'Import' },
        { key: 'settings', icon: '⚙️', label: 'Settings' },
      ] : []),
    ]
  }

  return null
}

// ── Screens that use the full viewport (no sidebar layout wrapper needed) ──
const PROTO_SCREENS = new Set(['layout-proto', 'training-proto'])

function LabHiveLogo({ size = 40 }) {
  return <img src={import.meta.env.BASE_URL + 'labhive_logo.svg'} width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} alt="LabHive" />
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar({ session, screen, activeModules, sidebarSubTab, setSidebarSubTab, setScreen, accentColor, accentLight }) {
  const isDash = screen === 'dashboard'
  const tabs   = getScreenTabs(screen, session)
  const mod    = MODULE_META[screen]
  const activeTab = sidebarSubTab || (tabs?.[0]?.key ?? null)

  // Build module list for dashboard state
  const allModuleKeys = ['home', 'equipment', 'equipmenthub', 'booking', 'training', 'projects', 'remessages', 'pm', 'barcodeqr', 'labmanagement']
  const visibleKeys = activeModules
    ? activeModules.filter(k => allModuleKeys.includes(k))
    : allModuleKeys

  return (
    <aside style={{
      width: 220, flexShrink: 0, background: '#fff',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {isDash ? (
        /* ── Dashboard: show module list ── */
        <>
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Modules</div>
          </div>
          <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
            {visibleKeys.map(key => {
              const m = MODULE_META[key]
              if (!m) return null
              return (
                <button key={key} className="sidebar-item" onClick={() => setScreen(key)}>
                  <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{m.icon}</span>
                  <span>{m.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>›</span>
                </button>
              )
            })}
          </nav>
        </>
      ) : (
        /* ── Module page: title + sub-tabs + pinned home footer ── */
        <>
          {/* Module title */}
          {mod && (
            <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{mod.icon}</span>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{mod.label}</div>
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          {tabs ? (
            <nav style={{ padding: '8px', overflowY: 'auto', flexShrink: 0 }}>
              {tabs.map(t => {
                const active = activeTab === t.key
                return (
                  <button key={t.key}
                    className={`sidebar-item${active ? ' active' : ''}`}
                    onClick={() => setSidebarSubTab(t.key)}
                    style={active ? { background: accentLight, color: accentColor } : {}}>
                    <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{t.icon}</span>
                    <span style={{ lineHeight: 1.3, flex: 1 }}>{t.label}</span>
                    {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </nav>
          ) : null}

          {/* Portal slot — screens inject custom sidebar content here via createPortal */}
          <div id="sidebar-portal-slot" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} />

          {/* Pinned Home button */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            <button
              onClick={() => setScreen('dashboard')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${accentColor}`,
                background: accentLight, color: accentColor,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.13s, transform 0.1s, box-shadow 0.13s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = '#fff'; e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}40` }}
              onMouseLeave={e => { e.currentTarget.style.background = accentLight; e.currentTarget.style.color = accentColor; e.currentTarget.style.boxShadow = 'none' }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}>
              🏠 <span>Home</span>
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

// ── Layout ─────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { session, setScreen, screen, clearSession, activeModules, sidebarSubTab, setSidebarSubTab } = useAppStore()
  const isMobile = useIsMobile()
  const isProto  = PROTO_SCREENS.has(screen)

  const accentColor = session?.loginMode === 'solo' ? '#534AB7' : '#1D9E75'
  const accentLight = session?.loginMode === 'solo' ? '#f0effe' : '#e6f7f2'
  const displayName = session?.role === 'admin' && !session?.userId ? '' : session?.username

  const showSidebar = !isMobile && !isProto && !!session

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{ background: '#0d47a1', borderBottom: '1px solid #0a3d91', paddingLeft: 16, paddingRight: 16, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 0, height: 'calc(56px + env(safe-area-inset-top, 0px))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 100 }}>
        <div onClick={() => setScreen('dashboard')} style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ marginTop: 20 }}><LabHiveLogo size={79} /></div>
          {!isMobile && (
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', color: '#ffffff', lineHeight: 1.1 }}>LabHive</div>
              <div style={{ fontSize: 10, color: '#ffb380', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2 }}>The All-in-One Research Lab Platform</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {session?.userId === null && session?.role === 'admin' ? <SuperAdminBell /> : session?.userId ? <NotificationBell /> : null}
          {session && (
            <button onClick={() => setScreen('profile')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, padding: '4px 10px 4px 4px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {session.photoUrl
                  ? <img src={session.photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : session.avatar
                    ? <span style={{ fontSize: 16 }}>{session.avatar}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{(session.username || 'A')[0].toUpperCase()}</span>
                }
              </div>
              {!isMobile && displayName && (
                <span style={{ fontSize: 13, color: '#e3f2fd', fontFamily: 'var(--mono)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              )}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => clearSession()} style={{ border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#ffffff', flexShrink: 0 }}>{isMobile ? '↩' : 'Sign out'}</button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {showSidebar && (
          <Sidebar
            session={session}
            screen={screen}
            activeModules={activeModules}
            sidebarSubTab={sidebarSubTab}
            setSidebarSubTab={setSidebarSubTab}
            setScreen={setScreen}
            accentColor={accentColor}
            accentLight={accentLight}
          />
        )}

        <main style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarGutter: 'stable',
          paddingTop: isProto ? 0 : '24px',
          paddingLeft: isProto ? 0 : '20px',
          paddingRight: isProto ? 0 : '20px',
          paddingBottom: isMobile
            ? 'calc(72px + env(safe-area-inset-bottom, 0px))'
            : isProto ? 0 : '24px',
        }}>
          {children}
          {!isMobile && !isProto && screen !== 'dashboard' && (
            <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 11, color: 'var(--text3)' }}>
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Privacy Policy</a>
              <span style={{ margin: '0 6px' }}>·</span>
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <nav style={{ flexShrink: 0, zIndex: 200, background: '#fff', borderTop: '1px solid #e0e0e0', boxShadow: '0 -2px 12px rgba(0,0,0,0.07)', paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) / 2), 4px)' }}>
          <div style={{ display: 'flex', height: 56 }}>
            {NAV_TABS.map(tab => {
              const isActive = tab.screens.includes(screen)
              const dest = tab.id === 'home' ? 'dashboard' : tab.id === 'booking' ? 'booking' : tab.id === 'messages' ? 'remessages' : tab.id === 'projects' ? 'projects' : 'profile'
              return (
                <button key={tab.id} onClick={() => setScreen(dest)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 2px 4px', position: 'relative', WebkitTapHighlightColor: 'transparent' }}>
                  {isActive && <span style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 40, height: 32, background: accentLight, borderRadius: 10 }} />}
                  <span style={{ fontSize: 20, lineHeight: 1, position: 'relative', zIndex: 1 }}>{tab.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? accentColor : '#aaa', fontFamily: 'var(--sans)', position: 'relative', zIndex: 1, letterSpacing: '-0.01em' }}>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
