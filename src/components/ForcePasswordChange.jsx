import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { sb } from '../lib/supabase'

export default function ForcePasswordChange() {
  const { session, setSession, toast } = useAppStore()
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!current.trim())          { setError('Enter your current (temporary) password.'); return }
    if (next.length < 6)          { setError('New password must be at least 6 characters.'); return }
    if (next !== confirm)         { setError('Passwords do not match.'); return }
    if (next === current)         { setError('New password must be different from the current one.'); return }
    setLoading(true)

    // Verify current password by reauthenticating
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email: session.email, password: current })
    if (reAuthErr) { setError('Current password is incorrect.'); setLoading(false); return }

    // Change password via Supabase Auth
    const { error: updateErr } = await sb.auth.updateUser({ password: next })
    if (updateErr) { setError('Failed to update password. Try again.'); setLoading(false); return }

    // Clear the must_change_password flag
    await sb.from('users').update({ must_change_password: false }).eq('id', session.userId)

    const updated = { ...session, mustChangePassword: false }
    setSession(updated)
    localStorage.setItem('ilab_session', JSON.stringify(updated))
    toast('Password updated successfully.')
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 16, padding: 32, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Set your new password</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Your admin set a temporary password. You must change it before continuing.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Current (temporary) password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={e => { setCurrent(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowCurrent(s => !s)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text3)', padding: 4 }}>
                {showCurrent ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="field">
            <label>New password (min 6 characters)</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={e => { setNext(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="new-password"
                style={{ paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowNext(s => !s)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text3)', padding: 4 }}>
                {showNext ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--accent2)', background: 'var(--accent2-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 13,
            background: loading ? 'var(--border)' : '#1D9E75',
            color: loading ? 'var(--text3)' : '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Saving…' : 'Set new password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
