import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { useState, useEffect, useRef } from 'react'

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
      <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '2px 9px', marginBottom: 7, background: badgeBg, color: badgeColor }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>{title}</div>
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#EEEDFE', border: '1px solid #CECBF6', borderRadius: 99, padding: '5px 14px' }}>
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="11" r="5" stroke="#534AB7" strokeWidth="2"/>
            <path d="M6 28c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#534AB7" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7' }}>LabHive Solo</span>
        </div>
      </div>

      <form onSubmit={handleSignUp}>
        <div className="field">
          <label>Full name *</label>
          <input value={form.name} onChange={e => { setForm(f => ({...f, name: e.target.value})); setError('') }} placeholder="e.g. Jane Smith" autoComplete="name" />
        </div>
        <div className="field">
          <label>Email address *</label>
          <input type="email" value={form.email} onChange={e => { setForm(f => ({...f, email: e.target.value})); setError('') }} placeholder="your@email.com" autoComplete="email" />
        </div>
        <div className="field">
          <label>Password * (min 6 characters)</label>
          <input type="password" value={form.password} onChange={e => { setForm(f => ({...f, password: e.target.value})); setError('') }} placeholder="••••••••" autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Confirm password *</label>
          <input type="password" value={form.confirm} onChange={e => { setForm(f => ({...f, confirm: e.target.value})); setError('') }} placeholder="••••••••" autoComplete="new-password" />
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={termsAccepted} onChange={e => { setTermsAccepted(e.target.checked); setError('') }}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: '#534AB7', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            I have read and agree to the{' '}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'underline' }}>Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: '#534AB7', fontWeight: 600, textDecoration: 'underline' }}>Terms of Service</a>.
            I understand how my data will be used.
          </span>
        </label>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>⚠️ {error}</div>
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
  const [identifier, setIdentifier] = useState('')
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

  const accentColor = mode === 'solo' ? '#534AB7' : '#0d47a1'

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
    setLoading(true); setError('')
    const emailLower = identifier.trim().toLowerCase()

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: emailLower, password })
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
    const authUserId = authData.user.id

    if (mode === 'team') {
      // Check super admin
      const { data: saRow } = await sb.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
      if (saRow?.value === authUserId) {
        const adminSessionObj = { role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' }
        setSession(adminSessionObj)
                setLoading(false); return
      }
      // Team user: look up by auth_id; auto-link by email on first login
      let user = null
      const { data: byAuthId } = await sb.from('users').select('*').eq('auth_id', authUserId).eq('is_active', true).maybeSingle()
      if (byAuthId) {
        user = byAuthId
      } else {
        const { data: byEmail } = await sb.from('users').select('*').ilike('email', emailLower).is('auth_id', null).eq('is_active', true).maybeSingle()
        if (byEmail) {
          await sb.from('users').update({ auth_id: authUserId }).eq('id', byEmail.id)
          user = { ...byEmail, auth_id: authUserId }
        }
      }
      if (!user) { await sb.auth.signOut(); setError('No account found. Contact your organization admin.'); setLoading(false); return }
      const adminLevel = user.admin_level || 0
      const role = user.role === 'admin' || adminLevel >= 1 ? 'admin' : user.role
      const teamSessionObj = {
        role, dbRole: user.role, username: user.name, userId: user.id, email: user.email,
        adminLevel, photoUrl: user.photo_url, avatar: user.avatar,
        loginMode: 'team',
        organizationId: user.organization_id || null,
        projectGroup: user.project_group || null,
        mustChangePassword: user.must_change_password === true,
        termsAcceptedVersion: user.terms_accepted_version || null,
      }
      setSession(teamSessionObj)
            setLoading(false); return
    }

    if (mode === 'solo') {
      let soloUser = null
      const { data: byAuthId } = await sb.from('solo_users').select('*').eq('auth_id', authUserId).maybeSingle()
      if (byAuthId) {
        soloUser = byAuthId
      } else {
        const { data: byEmail } = await sb.from('solo_users').select('*').ilike('email', emailLower).is('auth_id', null).maybeSingle()
        if (byEmail) {
          await sb.from('solo_users').update({ auth_id: authUserId }).eq('id', byEmail.id)
          soloUser = { ...byEmail, auth_id: authUserId }
        }
      }
      if (!soloUser) { await sb.auth.signOut(); setError('No Solo account found. Please sign up first.'); setLoading(false); return }
      if (soloUser.deletion_requested_at) { await sb.auth.signOut(); setError('This account is pending deletion. Your teammates have been notified and have 7 days to respond.'); setLoading(false); return }
      const soloSessionObj = {
        role: 'solo', username: soloUser.name, userId: soloUser.id,
        email: soloUser.email, photoUrl: soloUser.photo_url, avatar: soloUser.avatar,
        activeModules: soloUser.active_modules || [], loginMode: 'solo',
        termsAcceptedVersion: soloUser.terms_accepted_version || null,
        isPaid: soloUser.is_paid || false,
      }
      setSession(soloSessionObj)
            const { data: memberships } = await sb.from('solo_workspace_members').select('owner_id').eq('member_id', soloUser.id)
      if (memberships?.length) {
        const ownerIds = memberships.map(m => m.owner_id)
        const { data: owners } = await sb.from('solo_users').select('id, name').in('id', ownerIds)
        setSharedWorkspaces((owners || []).map(o => ({ ownerId: o.id, ownerName: o.name })))
      } else {
        setSharedWorkspaces([])
      }
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', background: 'var(--bg)', padding: '8px 20px 8px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        <div style={{ textAlign: 'center', marginBottom: -40 }}>
          <LabHiveLogo size={200} />
        </div>

        <div className="card" style={{ padding: '28px 28px 12px' }}>

          {/* Show sign-up form OR login form */}
          {showSignUp ? (
            <SignUpForm onSuccess={handleSignUpSuccess} onCancel={() => setShowSignUp(false)} />
          ) : (
            <>
              {/* QR scan context banner */}
              {QR_SCAN_EQ && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 10, marginBottom: 18 }}>
                  <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>🔲</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#e65100', marginBottom: 3 }}>Equipment QR Code Scanned</div>
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
                <div style={{ background: '#EEEDFE', border: '1px solid #CECBF6', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#534AB7', marginBottom: 16, fontWeight: 500 }}>
                  ✅ Account created! Your email has been filled in — enter your password and sign in.
                </div>
              )}

              {mode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
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
                    placeholder={mode === 'solo' ? 'your@email.com' : 'name or netid@illinois.edu'}
                    autoComplete="username" disabled={!mode} />
                </div>
                <div className="field" style={{ opacity: mode ? 1 : 0.35, pointerEvents: mode ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                  <label>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="••••••••" autoComplete="current-password"
                      style={{ paddingRight: 44 }} disabled={!mode} />
                    <button type="button" onClick={() => setShowPassword(s => !s)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)', padding: 4 }}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>⚠️ {error}</div>
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
                  style={{ width: '100%', marginTop: 12, padding: '11px', background: 'transparent', color: '#534AB7', border: '2px solid #534AB7', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEEDFE' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  ✨ New here? Create a free LabHive Solo account
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

      </div>
    </div>
  )
}
// FORCE_REBUILD_TEST_1778520430
