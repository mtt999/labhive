import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { setPublicDemo, isPublicDemo } from '../../lib/demoMode'
import { useState, useEffect, useRef } from 'react'
import AboutModal from '../../components/AboutModal'
import CustomerServiceModal from '../../components/CustomerServiceModal'
import SaraChat from '../../components/SaraChat'
import { IconQr, IconAlert, IconEye, IconEyeOff, IconCheckCircle, IconSparkle, IconInfo, IconMail } from '../../components/Icons'
import LoginBackground from '../../components/LoginBackground'

function LabHiveLogo({ size = 120 }) {
  return <img src={import.meta.env.BASE_URL + 'labhive_logo.svg'} width={size} height={size} style={{ display: 'block', objectFit: 'contain', margin: '0 auto' }} alt="LabHive" />
}

function SelectorCard({ mode, selected, onSelect }) {
  const isTeam      = mode === 'team'
  const activeColor = isTeam ? '#1D9E75' : '#534AB7'
  const activeBg    = isTeam ? '#E1F5EE' : '#EEEDFE'
  const badgeBg     = isTeam ? '#9FE1CB' : '#CECBF6'
  const badgeColor  = isTeam ? '#085041' : '#3C3489'
  const label       = isTeam ? 'LabHive Team' : 'LabHive Solo'
  const title       = isTeam ? 'Organization member' : 'Individual researcher'
  const desc        = isTeam
    ? 'My organization uses LabHive — I have an invite or org credentials'
    : 'Organize my own research, projects & lab resources independently'

  const teamIcon = (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="10" cy="12" r="4" stroke="#0F6E56" strokeWidth="1.6"/>
      <circle cx="22" cy="12" r="4" stroke="#0F6E56" strokeWidth="1.6"/>
      <circle cx="16" cy="10" r="4.5" fill="#9FE1CB" stroke="#0F6E56" strokeWidth="1.6"/>
      <path d="M4 26c0-3.314 2.686-6 6-6h12c3.314 0 6 2.686 6 6" stroke="#0F6E56" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )

  const soloIcon = (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="11" r="5" stroke="#534AB7" strokeWidth="1.6"/>
      <path d="M6 28c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#534AB7" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M22 7l2 2M24 5v2.5M21.5 5h2.5" stroke="#534AB7" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )

  return (
    <div onClick={() => onSelect(mode)} style={{
      flex: 1, background: selected ? activeBg : 'var(--surface)',
      border: selected ? `2px solid ${activeColor}` : '1.5px solid var(--border)',
      borderRadius: 14, padding: '16px 14px 14px', cursor: 'pointer',
      textAlign: 'center', position: 'relative',
      transition: 'border-color 0.15s, background 0.15s', userSelect: 'none',
    }}>
      {selected && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <div style={{ width: 56, height: 56, borderRadius: 14, background: isTeam ? '#E1F5EE' : '#EEEDFE', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isTeam ? teamIcon : soloIcon}
      </div>
      <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '2px 8px', marginBottom: 8, background: badgeBg, color: badgeColor }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

// ── iLab Solo Sign-Up Form ─────────────────────────────────────────────────
function SignUpForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim())               { setError('Please enter your full name.'); return }
    if (!form.email.trim())              { setError('Please enter your email address.'); return }
    if (form.password.length < 6)       { setError('Password must be at least 6 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (!termsAccepted)                 { setError('Please read and accept the Privacy Policy and Terms of Service to continue.'); return }
    setLoading(true)

    const emailLC = form.email.trim().toLowerCase()
    let authUserId = null

    const { data: authData, error: authError } = await sb.auth.signUp({ email: emailLC, password: form.password })
    if (authError) {
      if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already been registered')) {
        // Auth account exists — may be an orphaned record (solo_users insert failed previously).
        // Try signing in with the provided password to recover.
        const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email: emailLC, password: form.password })
        if (signInErr) {
          // Wrong password → genuine existing account
          setError('An account with this email already exists. Please sign in.')
          setLoading(false); return
        }
        authUserId = signInData.user.id
        const { data: existing } = await sb.from('solo_users').select('id').eq('auth_id', authUserId).maybeSingle()
        if (existing) {
          // Complete account exists → redirect to sign in
          await sb.auth.signOut()
          setError('An account with this email already exists. Please sign in.')
          setLoading(false); return
        }
        // Orphaned auth record — continue to create the solo_users row below
      } else {
        setError(authError.message)
        setLoading(false); return
      }
    } else {
      authUserId = authData.user.id
    }

    const { data, error: insertErr } = await sb.from('solo_users').insert({
      name: form.name.trim(),
      email: emailLC,
      auth_id: authUserId,
      active_modules: [],
    }).select().single()

    if (insertErr) { await sb.auth.signOut(); setError('Error creating account: ' + insertErr.message); setLoading(false); return }
    setLoading(false)
    onSuccess(data)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', padding: 0, lineHeight: 1 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>Create LabHive Solo account</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Free — organize your research independently</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEEDFE', border: '1px solid #CECBF6', borderRadius: 99, padding: '4px 14px' }}>
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="11" r="5" stroke="#534AB7" strokeWidth="2"/>
            <path d="M6 28c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#534AB7" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7' }}>LabHive Solo</span>
        </div>
      </div>

      <form onSubmit={handleSignUp}>
        <div className="field">
          <label>Full name <span style={{ color: '#c84b2f' }}>*</span></label>
          <input value={form.name} onChange={e => { setForm(f => ({...f, name: e.target.value})); setError('') }} placeholder="e.g. Jane Smith" autoComplete="name" />
        </div>
        <div className="field">
          <label>Email address <span style={{ color: '#c84b2f' }}>*</span></label>
          <input type="email" value={form.email} onChange={e => { setForm(f => ({...f, email: e.target.value})); setError('') }} placeholder="your@email.com" autoComplete="email" />
        </div>
        <div className="field">
          <label>Password <span style={{ color: '#c84b2f' }}>*</span> (min 6 characters)</label>
          <input type="password" value={form.password} onChange={e => { setForm(f => ({...f, password: e.target.value})); setError('') }} placeholder="••••••••" autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Confirm password <span style={{ color: '#c84b2f' }}>*</span></label>
          <input type="password" value={form.confirm} onChange={e => { setForm(f => ({...f, confirm: e.target.value})); setError('') }} placeholder="••••••••" autoComplete="new-password" />
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={termsAccepted} onChange={e => { setTermsAccepted(e.target.checked); setError('') }}
            style={{ marginTop: 4, width: 16, height: 16, flexShrink: 0, accentColor: '#534AB7', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            I have read and agree to the{' '}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'underline' }}>Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'underline' }}>Terms of Service</a>.
            I understand how my data will be used.
          </span>
        </label>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}><IconAlert size={16} /> {error}</div>
        )}

        <button type="submit" disabled={loading || !termsAccepted}
          style={{ width: '100%', padding: '12px', background: loading || !termsAccepted ? 'var(--border)' : '#534AB7', color: loading || !termsAccepted ? 'var(--text3)' : '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: loading || !termsAccepted ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
          {loading ? 'Creating account…' : 'Create free account'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>
        Already have an account?{' '}
        <span style={{ color: '#534AB7', fontWeight: 600, cursor: 'pointer' }} onClick={onCancel}>Sign in</span>
      </div>
    </div>
  )
}

// ── Main Login ─────────────────────────────────────────────────────────────
const QR_SCAN_EQ = new URLSearchParams(window.location.search).get('eq')

export default function Login() {
  const { setSession, setLoginMode, setSharedWorkspaces } = useAppStore()
  // When arriving from a QR code scan, default to Solo mode so visitors can sign up
  const [mode, setMode]             = useState(QR_SCAN_EQ ? 'solo' : null)
  const [identifier, setIdentifier] = useState(() => localStorage.getItem('ilab_remembered_email') || '')
  // "Keep me signed in" — controls whether the Supabase auth session persists
  // across browser restarts (see the auth storage adapter in lib/supabase.js)
  const [keepSignedIn, setKeepSignedIn] = useState(() => localStorage.getItem('ilab_keep_signed_in') !== 'false')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const [showHelpLookup, setShowHelpLookup] = useState(false)
  const [helpEmail, setHelpEmail] = useState('')
  const [helpResult, setHelpResult] = useState(null)
  const [helpLoading, setHelpLoading] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [lockUntil, setLockUntil] = useState(0)
  const [showAbout, setShowAbout]   = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [accountPicker, setAccountPicker] = useState(null) // { rows, orgsMap, isSuperAdmin }
  const lockTimerRef = useRef(null)

  useEffect(() => {
    if (lockUntil <= Date.now()) return
    lockTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        clearInterval(lockTimerRef.current)
        setError('')
      } else {
        setError(`Too many failed attempts. Please wait ${remaining} second${remaining !== 1 ? 's' : ''}.`)
      }
    }, 500)
    return () => clearInterval(lockTimerRef.current)
  }, [lockUntil])

  const accentColor = mode === 'solo' ? '#534AB7' : '#1D9E75'

  function applyTeamSession(user) {
    const adminLevel = user.admin_level || 0
    const role = user.role === 'admin' || adminLevel >= 1 ? 'admin' : user.role
    const isDemo = isPublicDemo(user.email)
    // Remember exactly which row was chosen — a single auth_id can have multiple
    // `users` rows (e.g. demo's Manager + Lab User, or an admin added as another
    // role). Without this, a hard refresh can't disambiguate which one was active
    // and silently resolves to the wrong identity (see restoreSessionFromAuth).
    localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'team', id: user.id }))
    setSession({
      role, dbRole: user.role,
      username: user.nick_name?.trim() || user.name,
      userId: user.id, email: user.email,
      adminLevel, photoUrl: user.photo_url, avatar: user.avatar,
      loginMode: 'team',
      organizationId: user.organization_id || null,
      projectGroup: user.project_group || null,
      mustChangePassword: user.must_change_password === true,
      termsAcceptedVersion: isDemo ? null : (user.terms_accepted_version || null),
      tourDone: isDemo ? false : (user.tour_done === true),
      pickerDone: isDemo ? false : (user.picker_done === true),
      isDemo,
    })
  }

  function applySuperAdmin() {
    localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'admin' }))
    setSession({ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' })
  }

  function applySoloSession(soloUser) {
    const isDemo = isPublicDemo(soloUser.email)
    localStorage.setItem('ilab_active_identity', JSON.stringify({ kind: 'solo', id: soloUser.id }))
    setSession({
      role: 'solo', username: soloUser.nick_name?.trim() || soloUser.name,
      userId: soloUser.id, email: soloUser.email,
      photoUrl: soloUser.photo_url, avatar: soloUser.avatar,
      activeModules: soloUser.active_modules || [], loginMode: 'solo',
      termsAcceptedVersion: isDemo ? null : (soloUser.terms_accepted_version || null),
      isPaid: soloUser.is_paid || false,
      tourDone: isDemo ? false : (soloUser.tour_done === true),
      pickerDone: isDemo ? false : (soloUser.picker_done === true),
      isDemo,
    })
    sb.from('solo_workspace_members').select('owner_id').eq('member_id', soloUser.id)
      .then(({ data: memberships }) => {
        if (memberships?.length) {
          const ownerIds = memberships.map(m => m.owner_id)
          sb.from('solo_users').select('id, name').in('id', ownerIds)
            .then(({ data: owners }) => setSharedWorkspaces((owners || []).map(o => ({ ownerId: o.id, ownerName: o.name }))))
        } else {
          setSharedWorkspaces([])
        }
      })
  }

  function handleModeSelect(m) {
    setMode(m); setLoginMode(m); setError('')
    setShowSignUp(false); setSignUpSuccess(false)
  }

  function handleSignUpSuccess(newUser) {
    setIdentifier(newUser.email)
    setShowSignUp(false)
    setSignUpSuccess(true)
  }

  async function findOrgContact() {
    if (!helpEmail.trim()) return
    setHelpLoading(true); setHelpResult(null)
    const { data: user } = await sb.from('users').select('organization_id').ilike('email', helpEmail.trim()).maybeSingle()
    let org = null
    if (user?.organization_id) {
      const { data } = await sb.from('organizations').select('name, contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
      org = data
    }
    setHelpResult(org || { noContact: true })
    setHelpLoading(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (lockUntil > Date.now()) {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
      setError(`Too many failed attempts. Please wait ${remaining} second${remaining !== 1 ? 's' : ''}.`)
      return
    }
    if (!mode) { setError('Please select how you are using LabHive first.'); return }
    if (!identifier.trim() || !password.trim()) { setError('Please enter your email and password.'); return }
    // Must be set BEFORE signInWithPassword — the auth storage adapter reads it
    localStorage.setItem('ilab_keep_signed_in', String(keepSignedIn))
    if (keepSignedIn) localStorage.setItem('ilab_remembered_email', identifier.trim())
    else localStorage.removeItem('ilab_remembered_email')
    setLoading(true); setError('')
    const emailLower = identifier.trim().toLowerCase()

    // Demo account shortcut: "demo" / "demo" → real Supabase credentials
    const isDemoLogin = (emailLower === 'demo' || emailLower === 'demo@labhive.app') && password === 'demo'
    const loginEmail    = isDemoLogin ? 'demo@labhive.app' : emailLower
    const loginPassword = isDemoLogin ? 'DemoLabHive2026!' : password
    // Restrictions follow the ROUTE taken, not the address: demo/demo is the
    // public shortcut, while the same account entered with its real password
    // is the owner and stays unrestricted.
    setPublicDemo(isDemoLogin)

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (authError) {
      const newCount = failCount + 1
      setFailCount(newCount)
      if (newCount >= 3) {
        const until = Date.now() + 30_000
        setLockUntil(until)
        setError('Too many failed attempts. Please wait 30 seconds.')
      } else {
        setError('Incorrect email or password.')
      }
      setLoading(false)
      return
    }
    setFailCount(0); setLockUntil(0)
    // Demo: clear tour/picker state so every demo login starts fresh
    if (isDemoLogin) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('ilab_tour') || k.startsWith('ilab_login_count') || k.startsWith('ilab_tip') || k.startsWith('ilab_picker_done'))
        .forEach(k => localStorage.removeItem(k))
    }
    const authUserId = authData.user.id

    // Always check super-admin status and fetch all roles in parallel
    // loginEmail is the real email (demo@labhive.app for demo logins, emailLower otherwise)
    const [{ data: saSettings }, { data: emailRows }, { data: soloByAuth }] = await Promise.all([
      sb.from('settings').select('key,value').in('key', ['super_admin_auth_id', 'admin_email']),
      sb.from('users').select('*').ilike('email', loginEmail).eq('is_active', true),
      sb.from('solo_users').select('*').eq('auth_id', authUserId).maybeSingle(),
    ])

    const saCfg = Object.fromEntries((saSettings || []).map(r => [r.key, r.value]))
    const isSuperAdmin = saCfg.super_admin_auth_id === authUserId || saCfg.admin_email?.toLowerCase() === loginEmail

    // Resolve solo user (try auth_id first, then email link)
    let soloUser = soloByAuth || null
    if (!soloUser) {
      const { data: soloByEmail } = await sb.from('solo_users').select('*').ilike('email', loginEmail).is('auth_id', null).maybeSingle()
      if (soloByEmail) {
        await sb.from('solo_users').update({ auth_id: authUserId }).eq('id', soloByEmail.id)
        soloUser = { ...soloByEmail, auth_id: authUserId }
      }
    }
    if (soloUser?.deletion_requested_at) {
      await sb.auth.signOut()
      setError('This account is pending deletion.')
      setLoading(false); return
    }

    const userRows = emailRows || []
    // Auto-link auth_id for any team rows missing it
    const toLink = userRows.filter(u => !u.auth_id)
    if (toLink.length) await sb.from('users').update({ auth_id: authUserId }).in('id', toLink.map(u => u.id))

    const hasTeamRows  = userRows.length > 0
    const hasSolo      = !!soloUser
    const hasManager   = userRows.some(u => u.role === 'user')
    const hasAdmin     = userRows.some(u => u.role === 'admin')

    if (!isSuperAdmin && !hasTeamRows && !hasSolo) {
      await sb.auth.signOut()
      setError(mode === 'solo' ? 'No Solo account found. Please sign up first.' : 'No account found. Contact your organization admin.')
      setLoading(false); return
    }

    // Auto-login: solo only, no super admin, no team roles
    if (!isSuperAdmin && !hasTeamRows && hasSolo) {
      applySoloSession(soloUser)
      setLoading(false); return
    }

    // Auto-login: single lab_user only, no super admin, no solo
    if (!isSuperAdmin && !hasManager && !hasAdmin && !hasSolo && userRows.length === 1) {
      applyTeamSession(userRows[0])
      setLoading(false); return
    }

    // Auto-login: super admin with nothing else
    if (isSuperAdmin && !hasTeamRows && !hasSolo) {
      applySuperAdmin()
      setLoading(false); return
    }

    // Show role picker — super admin always gets the picker so they can choose their role
    const orgIds = [...new Set(userRows.map(u => u.organization_id).filter(Boolean))]
    const { data: orgsData } = orgIds.length
      ? await sb.from('organizations').select('id,name').in('id', orgIds)
      : { data: [] }
    const orgsMap = Object.fromEntries((orgsData || []).map(o => [o.id, o.name]))
    setAccountPicker({ rows: userRows, orgsMap, isSuperAdmin, soloUser })
    setLoading(false)
  }

  return (
    <>
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', background: 'var(--bg)', padding: '8px 20px 8px' }}>
      <LoginBackground />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: -40 }}>
          <LabHiveLogo size={200} />
        </div>

        <div className="card" style={{ padding: '28px 28px 12px' }}>

          {/* Show sign-up form OR account picker OR login form */}
          {showSignUp ? (
            <SignUpForm onSuccess={handleSignUpSuccess} onCancel={() => setShowSignUp(false)} />
          ) : accountPicker ? (
            /* Role picker — shown when user has multiple roles / orgs */
            (() => {
              const { rows, orgsMap, isSuperAdmin, soloUser: pickerSolo } = accountPicker
              // Public demo visitors never see an admin identity at all —
              // not greyed out, not listed. Signing in with the account's real
              // password clears the public flag, so the owner still gets it.
              const hideAdmin   = isPublicDemo(rows[0]?.email)
              const adminRows   = hideAdmin ? [] : rows.filter(u => u.role === 'admin')
              const managerRows = rows.filter(u => u.role === 'user')
              const labUserRows = rows.filter(u => u.role === 'lab_user')

              const ROLE_CARDS = [
                ...(isSuperAdmin ? [{ key: 'superadmin', label: 'Super Admin', sub: 'Full system access — all organizations', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA', available: true, onClick: () => { applySuperAdmin(); setAccountPicker(null) } }] : []),
                ...(hideAdmin ? [] : [{ key: 'admin',   label: 'Org Admin',    sub: adminRows[0]   ? (orgsMap[adminRows[0].organization_id]   || 'Organization Admin')  : 'You don\'t have an admin account',   bg: '#FEF3C7', color: '#92400E', border: '#FCD34D', available: adminRows.length   > 0, rows: adminRows }]),
                { key: 'manager', label: 'Lab Manager',  sub: managerRows[0] ? (orgsMap[managerRows[0].organization_id] || 'Lab Manager')           : 'You don\'t have a lab manager account', bg: '#E1F5EE', color: '#065F46', border: '#9FE1CB', available: managerRows.length > 0, rows: managerRows },
                { key: 'labuser', label: 'Lab User',     sub: labUserRows[0] ? (orgsMap[labUserRows[0].organization_id] || 'Lab User')              : 'You don\'t have a lab user account',   bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE', available: labUserRows.length > 0, rows: labUserRows },
                ...(pickerSolo ? [{ key: 'solo', label: 'Solo User', sub: pickerSolo.nick_name?.trim() || pickerSolo.name || 'Personal workspace', bg: '#EEEDFE', color: '#534AB7', border: '#CECBF6', available: true, onClick: () => { applySoloSession(pickerSolo); setAccountPicker(null) } }] : []),
              ]

              return (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Select how to sign in</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Choose the role you'd like to use for this session.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {ROLE_CARDS.map(card => (
                      <button key={card.key}
                        onClick={card.available ? (card.onClick || (() => { applyTeamSession(card.rows[0]); setAccountPicker(null) })) : undefined}
                        style={{
                          padding: '12px 14px', border: `1.5px solid ${card.available ? card.border : 'var(--border)'}`,
                          borderRadius: 10,
                          background: card.available ? card.bg : 'var(--surface2)',
                          cursor: card.available ? 'pointer' : 'not-allowed',
                          textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          opacity: card.available ? 1 : 0.45, transition: 'opacity 0.15s',
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: card.available ? card.color : 'var(--text3)' }}>{card.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.sub}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, flexShrink: 0,
                          background: card.available ? 'rgba(255,255,255,0.55)' : 'var(--border)',
                          color: card.available ? card.color : 'var(--text3)',
                        }}>{card.available ? 'Sign in →' : 'No access'}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setAccountPicker(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', padding: 0, width: '100%', textAlign: 'center' }}>
                    ← Back to sign in
                  </button>
                </div>
              )
            })()
          ) : (
            <>
              {/* QR scan context banner */}
              {QR_SCAN_EQ && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 10, marginBottom: 16 }}>
                  <IconQr size={22} style={{ color: '#e65100', marginTop: 1 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#e65100', marginBottom: 4 }}>Equipment QR Code Scanned</div>
                    <div style={{ fontSize: 12, color: '#7c4d00', lineHeight: 1.5 }}>
                      Log in or create a free <strong>LabHive Solo</strong> account to view equipment info, book a session, and more.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, textAlign: 'center' }}>
                How are you using LabHive?
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <SelectorCard mode="team" selected={mode === 'team'} onSelect={handleModeSelect} />
                <SelectorCard mode="solo" selected={mode === 'solo'} onSelect={handleModeSelect} />
              </div>

              {mode === 'team' && (
                <div style={{ background: '#E1F5EE', border: '0.5px solid #9FE1CB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#085041', marginBottom: 16, lineHeight: 1.5 }}>
                  Access is managed by your organization admin. Contact them if you need an account.
                </div>
              )}

              {signUpSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#EEEDFE', border: '1px solid #CECBF6', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#534AB7', marginBottom: 16, fontWeight: 500 }}>
                  <IconCheckCircle size={17} /> Account created! Your email has been filled in — enter your password and sign in.
                </div>
              )}

              {mode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {mode === 'team' ? 'Sign in to LabHive Team' : 'Sign in to LabHive Solo'}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="field" style={{ opacity: mode ? 1 : 0.35, pointerEvents: mode ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                  <label>Email address</label>
                  <input type="text" value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setError('') }}
                    placeholder={mode === 'solo' ? 'your@email.com' : 'name or alex.smith@email.com'}
                    autoComplete="username" disabled={!mode} />
                </div>
                <div className="field" style={{ opacity: mode ? 1 : 0.35, pointerEvents: mode ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                  <label>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="••••••••" autoComplete="current-password"
                      style={{ paddingRight: 44 }} disabled={!mode} />
                    <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, display: 'flex', alignItems: 'center' }}>
                      {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: mode ? 'pointer' : 'default', opacity: mode ? 1 : 0.35, pointerEvents: mode ? 'auto' : 'none', transition: 'opacity 0.2s', fontSize: 13, color: 'var(--text2)', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={e => setKeepSignedIn(e.target.checked)}
                    disabled={!mode}
                    style={{ width: 16, height: 16, accentColor: accentColor, cursor: 'pointer', flexShrink: 0 }}
                  />
                  Keep me signed in on this device
                </label>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}><IconAlert size={16} /> {error}</div>
                )}

                <button type="submit"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '12px', background: (mode && lockUntil <= Date.now()) ? accentColor : 'var(--border)', color: (mode && lockUntil <= Date.now()) ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 8, cursor: (mode && lockUntil <= Date.now()) ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'background 0.2s' }}
                  disabled={loading || !mode || lockUntil > Date.now()}>
                  {loading ? 'Signing in…' : mode === 'team' ? 'Sign in to LabHive Team' : mode === 'solo' ? 'Sign in to LabHive Solo' : 'Select a login type above'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Privacy Policy</a>
                  <span style={{ margin: '0 6px' }}>·</span>
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)', textDecoration: 'underline' }}>Terms of Service</a>
                </div>
              </form>

              {mode === 'team' && (
                <div style={{ marginTop: 16 }}>
                  <button type="button" onClick={() => { setShowHelpLookup(v => !v); setHelpResult(null); setHelpEmail('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: 0, width: '100%', textAlign: 'center' }}>
                    {showHelpLookup ? '▲ Hide' : 'Need help logging in? Find your org contact →'}
                  </button>
                  {showHelpLookup && (
                    <div style={{ marginTop: 12, background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Enter your email to find your organization's contact</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="email"
                          value={helpEmail}
                          onChange={e => { setHelpEmail(e.target.value); setHelpResult(null) }}
                          onKeyDown={e => e.key === 'Enter' && findOrgContact()}
                          placeholder="your@email.com"
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        <button type="button" onClick={findOrgContact} disabled={helpLoading || !helpEmail.trim()}
                          style={{ padding: '8px 14px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {helpLoading ? '…' : 'Look up'}
                        </button>
                      </div>
                      {helpResult && (
                        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: helpResult.noContact || !helpResult.contact_email ? 'var(--surface)' : '#E1F5EE', border: '1px solid var(--border)' }}>
                          {helpResult.noContact || !helpResult.contact_email ? (
                            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                              {helpResult.noContact
                                ? 'No organization contact was found for that email address. Please verify the address or reach out to your lab manager directly.'
                                : `Your organization is ${helpResult.name}, but no contact email has been configured yet. Please reach out to your lab manager.`}
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 11, color: '#085041', marginBottom: 4 }}>Your organization: <strong>{helpResult.name}</strong></div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#085041' }}>Contact: {helpResult.contact_name || 'Lab Manager'}</div>
                              <a href={`mailto:${helpResult.contact_email}`}
                                style={{ fontSize: 13, color: '#1D9E75', fontWeight: 500, display: 'block', marginTop: 2 }}>
                                {helpResult.contact_email}
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {mode === 'solo' && !QR_SCAN_EQ && (
                <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>
                  New to LabHive Solo?{' '}
                  <span style={{ color: '#534AB7', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => { setShowSignUp(true); setError('') }}>Create a free account</span>
                </div>
              )}
              {mode === 'solo' && QR_SCAN_EQ && (
                <button
                  type="button"
                  onClick={() => { setShowSignUp(true); setError('') }}
                  style={{ width: '100%', marginTop: 12, padding: '12px', background: 'transparent', color: '#534AB7', border: '2px solid #534AB7', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEEDFE' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <IconSparkle size={17} /> New here? Create a free LabHive Solo account
                </button>
              )}

            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>LabHive</div>
          <div>The All-in-One Research Lab Platform</div>
          <div style={{ fontWeight: 500, color: 'var(--text2)', marginTop: 4 }}>Built by a lab researcher, for lab researchers</div>
          <div>© {new Date().getFullYear()} All rights reserved</div>
        </div>

        {/* ── About + Contact ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, paddingBottom: 8 }}>
          <button
            onClick={() => setShowAbout(true)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 16px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1D9E75'; e.currentTarget.style.color = '#1D9E75' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
          ><IconInfo size={15} /> About LabHive</button>
          <button
            onClick={() => setShowContact(true)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 16px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1D9E75'; e.currentTarget.style.color = '#1D9E75' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
          ><IconMail size={15} /> Contact Us</button>
        </div>

      </div>
    </div>

    {showAbout   && <AboutModal onClose={() => setShowAbout(false)} onContact={() => { setShowAbout(false); setShowContact(true) }} />}
    {showContact && <CustomerServiceModal onClose={() => setShowContact(false)} />}
    <SaraChat color={mode === 'solo' ? '#534AB7' : mode === 'team' ? '#1D9E75' : '#9ca3af'} onContact={() => setShowContact(true)} />
    </>
  )
}
// FORCE_REBUILD_TEST_1778520430
