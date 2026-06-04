import { useState } from 'react'

export default function TermsAcceptance({ session, onAccept }) {
  const [checked, setChecked] = useState(false)

  function accept() {
    if (!checked) return
    const key = `labhive_terms_v1_${session?.userId || session?.email}`
    localStorage.setItem(key, new Date().toISOString())
    onAccept()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 540, boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#0C1140', padding: '20px 28px' }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 4 }}>Welcome to LabHive 👋</div>
          <div style={{ fontSize: 13, color: '#FF9A4A' }}>Please review and accept our terms before continuing</div>
        </div>

        {/* Scrollable policy preview */}
        <div style={{ padding: '20px 28px', maxHeight: 280, overflowY: 'auto', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          <p style={{ marginBottom: 10 }}>By using LabHive you agree to our <strong>Privacy Policy</strong> and <strong>Terms of Service</strong>. Here are the key points:</p>
          <ul style={{ marginLeft: 18, marginBottom: 12 }}>
            <li style={{ marginBottom: 6 }}>We collect your name, email, and lab activity data (bookings, inspections, training records) to operate the platform.</li>
            <li style={{ marginBottom: 6 }}>We do <strong>not</strong> sell your data or use it for advertising.</li>
            <li style={{ marginBottom: 6 }}>Your data is accessible only to members of your organisation and authorised administrators.</li>
            <li style={{ marginBottom: 6 }}>You may request deletion of your data at any time via Customer Service.</li>
            <li style={{ marginBottom: 6 }}>The platform is provided "as is" — LabHive is not liable for loss of data or missed bookings.</li>
            <li style={{ marginBottom: 6 }}>Disputes are resolved by binding arbitration under Illinois law.</li>
          </ul>
          <p>Read the full documents before accepting:</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#f0f4ff', border: '1px solid #c7d7f9', borderRadius: 8, color: '#1a56db', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              📄 Privacy Policy ↗
            </a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#f0f4ff', border: '1px solid #c7d7f9', borderRadius: 8, color: '#1a56db', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              📋 Terms of Service ↗
            </a>
          </div>
        </div>

        {/* Checkbox + Accept */}
        <div style={{ padding: '20px 28px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: '#0C1140', cursor: 'pointer' }} />
            <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              I have read and agree to the{' '}
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0C1140', fontWeight: 600, textDecoration: 'underline' }}>Privacy Policy</a>
              {' '}and{' '}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0C1140', fontWeight: 600, textDecoration: 'underline' }}>Terms of Service</a>.
              I understand how my data will be collected and used.
            </span>
          </label>

          <button onClick={accept} disabled={!checked}
            style={{ width: '100%', padding: '12px', background: checked ? '#0C1140' : 'var(--border)', color: checked ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: checked ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
            Accept & Continue to LabHive
          </button>
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
            You must accept to use the platform. You may delete your account at any time.
          </div>
        </div>
      </div>
    </div>
  )
}
