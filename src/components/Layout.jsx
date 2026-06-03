import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import NotificationBell from './NotificationBell'
import SuperAdminBell from './SuperAdminBell'

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

const NAV_TABS = [
  { id: 'home',     icon: '🏠', label: 'Home',     screens: ['dashboard'] },
  { id: 'booking',  icon: '📅', label: 'Booking',  screens: ['booking', 'equipmentscan'] },
  { id: 'messages', icon: '💬', label: 'Messages', screens: ['remessages'] },
  { id: 'projects', icon: '🗂️', label: 'Projects', screens: ['projects', 'project-detail'] },
  { id: 'profile',  icon: '👤', label: 'Profile',  screens: ['profile'] },
]

function LabHiveLogo({ size = 40 }) {
  return <img src={import.meta.env.BASE_URL + 'labhive_logo.svg'} width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} alt="LabHive" />
}

export default function Layout({ children }) {
  const { session, setSession, setScreen, screen, clearSession } = useAppStore()
  const isMobile = useIsMobile()
  function logout() { clearSession() }
  const displayName = session?.role === 'admin' && !session?.userId ? '' : session?.username
  const accentColor = session?.loginMode === 'solo' ? '#534AB7' : '#1D9E75'
  const accentLight = session?.loginMode === 'solo' ? '#f0effe' : '#e6f7f2'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#0d47a1', borderBottom: '1px solid #0a3d91', paddingLeft: 16, paddingRight: 16, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 0, height: 'calc(56px + env(safe-area-inset-top, 0px))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 100 }}>
        <div onClick={() => setScreen('dashboard')} style={{ cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ marginTop: 20 }}><LabHiveLogo size={79} /></div>
          {!isMobile && (
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', color: '#ffffff', lineHeight: 1.1 }}>LabHive - Intelligent Lab</div>
              <div style={{ fontSize: 10, color: '#ffb380', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.2 }}>The All-in-One Research Lab Platform</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* ← Home only on desktop; bottom nav handles it on mobile */}
          {!isMobile && screen !== 'dashboard' && (
            <button className="btn btn-sm" style={{ border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 500 }} onClick={() => setScreen('dashboard')}>← Home</button>
          )}
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
          <button className="btn btn-sm" onClick={logout} style={{ border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#ffffff', flexShrink: 0 }}>{isMobile ? '↩' : 'Sign out'}</button>
        </div>
      </header>

      <main style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        maxWidth: screen === 'booking' ? '100%' : 960,
        margin: '0 auto',
        width: '100%',
        paddingTop: screen === 'booking' ? '16px' : '24px',
        paddingLeft: screen === 'booking' ? '10px' : '16px',
        paddingRight: screen === 'booking' ? '10px' : '16px',
        paddingBottom: isMobile ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : (screen === 'booking' ? '16px' : '24px'),
      }}>
        {children}
        {!isMobile && (
          <div style={{ textAlign: 'center', padding: '16px 0 4px', fontSize: 11, color: 'var(--text3)' }}>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Privacy Policy</a>
            <span style={{ margin: '0 6px' }}>·</span>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
          </div>
        )}
      </main>

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <nav style={{
          flexShrink: 0,
          zIndex: 200,
          background: '#fff',
          borderTop: '1px solid #e0e0e0',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.07)',
          paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) / 2), 4px)',
        }}>
          <div style={{ display: 'flex', height: 56 }}>
          {NAV_TABS.map(tab => {
            const isActive = tab.screens.includes(screen)
            const dest = tab.id === 'home' ? 'dashboard'
              : tab.id === 'booking' ? 'booking'
              : tab.id === 'messages' ? 'remessages'
              : tab.id === 'projects' ? 'projects'
              : 'profile'
            return (
              <button
                key={tab.id}
                onClick={() => setScreen(dest)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
                  cursor: 'pointer', padding: '6px 2px 4px', position: 'relative',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Pill highlight */}
                {isActive && (
                  <span style={{
                    position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
                    width: 40, height: 32, background: accentLight, borderRadius: 10,
                  }} />
                )}
                <span style={{ fontSize: 20, lineHeight: 1, position: 'relative', zIndex: 1 }}>{tab.icon}</span>
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? accentColor : '#aaa', fontFamily: 'var(--sans)', position: 'relative', zIndex: 1, letterSpacing: '-0.01em' }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
          </div>
        </nav>
      )}
    </div>
  )
}
