export function PasswordStrengthHint({ password }) {
  if (!password) return null
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter (A–Z)', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a–z)', ok: /[a-z]/.test(password) },
    { label: 'Symbol (e.g. !@#$%)', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  return (
    <div style={{ marginTop: 6, marginBottom: 2, padding: '8px 10px', background: 'var(--bg2, #f5f5f5)', borderRadius: 8 }}>
      {checks.map(c => (
        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.ok ? '#1D9E75' : '#999', marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{c.ok ? '✓' : '○'}</span>
          {c.label}
        </div>
      ))}
    </div>
  )
}
