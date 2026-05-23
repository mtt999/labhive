import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import Modal from '../../components/Modal'
import { ALL_MODULES_META } from '../../components/DashboardIconPicker'
import { PasswordStrengthHint } from '../../components/PasswordStrengthHint'

async function createAuthUser(email, password) {
  const { data: { session: prev } } = await sb.auth.getSession()
  const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
  if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
  if (error) {
    if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already been registered')) {
      // Check if it's an ACTIVE user in our DB — if so, block reuse
      const { data: activeUser } = await sb.from('users').select('id, auth_id').ilike('email', email).eq('is_active', true).maybeSingle()
      if (activeUser) throw new Error('This email is already in use by an active account.')
      // It's a deleted user — reset the auth password so the new temp password works
      const { error: resetErr } = await sb.rpc('reset_auth_user_password', { p_email: email.trim().toLowerCase(), p_password: password }).catch(() => ({ error: { message: 'reset_rpc_unavailable' } }))
      if (!resetErr || resetErr.message === 'reset_rpc_unavailable') {
        // Try to get the existing auth id so we can link the new DB row
        const { data: existingId } = await sb.rpc('get_auth_user_id_by_email', { p_email: email.trim().toLowerCase() }).catch(() => ({ data: null }))
        if (existingId) return { id: existingId }
      }
      throw new Error('This email belongs to a deleted account whose auth record still exists. Run the SQL cleanup or use a different email.')
    }
    throw error
  }
  return data.user
}

function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const arr = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    ...Array.from({ length: 4 }, () => all[Math.floor(Math.random() * all.length)]),
  ]
  return arr.sort(() => Math.random() - 0.5).join('')
}

const MODULE_IMAGE_DEFS = [
  { key: 'supply',         label: 'Supply Inventory',    icon: '📦' },
  { key: 'projects',       label: 'Project & Material',  icon: '🧪' },
  { key: 'training',       label: 'Training Records',    icon: '🎓' },
  { key: 'equipment',      label: 'Equipment Inventory', icon: '🔧' },
  { key: 'equipmenthub',   label: 'Equipment Hub',       icon: '📚' },
  { key: 'booking',        label: 'Booking Equipment',   icon: '📅' },
  { key: 'remessages',     label: 'RE Messages',         icon: '💬' },
  { key: 'pm',             label: 'Project Management',  icon: '📋' },
  { key: 'mileage',        label: 'Mileage Form',        icon: '🚗' },
  { key: 'labsafety',      label: 'Lab Safety',          icon: '🦺' },
  { key: 'labmanagement',  label: 'Lab Management',      icon: '🏛️' },
]

// Images are stored per-org in organizations.module_images (JSONB)
function ModuleImagesPanel({ orgId }) {
  const { toast } = useAppStore()
  const [images, setImages] = useState({})
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})

  useEffect(() => { if (orgId) loadImages() }, [orgId])

  async function loadImages() {
    const { data } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
    setImages(data?.module_images || {})
  }

  async function handleUpload(def, file) {
    if (!file) return
    setUploading(def.key)
    try {
      // Convert everything (including SVG) to 800×500 JPEG via FileReader data URL
      const compressed = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('File read failed'))
        reader.onload = e => {
          const img = new Image()
          img.onerror = () => reject(new Error('Image render failed'))
          img.onload = () => {
            const W = 800, H = 500
            const canvas = document.createElement('canvas')
            canvas.width = W; canvas.height = H
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#111'
            ctx.fillRect(0, 0, W, H)
            const scale = Math.max(W / img.width, H / img.height)
            const sw = img.width * scale, sh = img.height * scale
            ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.85)
          }
          img.src = e.target.result
        }
        reader.readAsDataURL(file)
      })
      const path = `module-images/${orgId}/${def.key}-${Date.now()}.jpg`
      const { error: upErr } = await sb.storage.from('project-files').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { toast('Storage upload failed: ' + upErr.message); return }
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
      const url = urlData.publicUrl
      const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
      const current = orgData?.module_images || {}
      const { error: saveErr } = await sb.from('organizations').update({ module_images: { ...current, [def.key]: url } }).eq('id', orgId)
      if (saveErr) { toast('Image uploaded but save failed: ' + saveErr.message); return }
      setImages(prev => ({ ...prev, [def.key]: url }))
      toast(`${def.label} image saved ✓`)
    } finally {
      setUploading(null)
      if (fileRefs.current[def.key]) fileRefs.current[def.key].value = ''
    }
  }

  async function clearImage(def) {
    const { data: orgData } = await sb.from('organizations').select('module_images').eq('id', orgId).maybeSingle()
    const current = { ...(orgData?.module_images || {}) }
    delete current[def.key]
    await sb.from('organizations').update({ module_images: Object.keys(current).length ? current : null }).eq('id', orgId)
    setImages(prev => { const n = { ...prev }; delete n[def.key]; return n })
    toast(`${def.label} image removed.`)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.6 }}>
        Upload background images for your organization's dashboard module cards. Best size: landscape, around 800×500 px.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {MODULE_IMAGE_DEFS.map(def => {
          const currentUrl = images[def.key]
          const isUploading = uploading === def.key
          return (
            <div key={def.key} style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
              <div style={{ height: 118, position: 'relative', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {currentUrl
                  ? <img src={currentUrl} alt={def.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                  : <div style={{ fontSize: 34, opacity: 0.35 }}>{def.icon}</div>
                }
                {currentUrl && (
                  <button onClick={() => clearImage(def)}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontWeight: 500 }}>
                    ✕ Remove
                  </button>
                )}
                {isUploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner" />
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</div>
                  <button className="btn btn-sm btn-primary" disabled={isUploading} onClick={() => fileRefs.current[def.key]?.click()}>
                    {currentUrl ? 'Replace' : 'Upload'}
                  </button>
                  <input type="file" accept="image/*,.svg" ref={el => fileRefs.current[def.key] = el} style={{ display: 'none' }}
                    onChange={e => { handleUpload(def, e.target.files[0]) }} />
                </div>
                {currentUrl && (
                  <a href={currentUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all', lineHeight: 1.4 }}>
                    Test image URL ↗
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Super admin: session.userId === null (logged in via /admin password)
// Org admin:   session.userId !== null && session.role === 'admin'

// ── Org Settings panel (org admin only) ──────────────────────
function OrgSettingsPanel({ session }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState({ contact_name: '', contact_email: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.organizationId) { setLoading(false); return }
    sb.from('organizations').select('contact_name, contact_email').eq('id', session.organizationId).maybeSingle()
      .then(({ data }) => {
        if (data) setForm({ contact_name: data.contact_name || '', contact_email: data.contact_email || '' })
        setLoading(false)
      })
  }, [session?.organizationId])

  async function save() {
    if (!session?.organizationId) return
    if (!form.contact_email.trim()) { toast('Contact email is required.'); return }
    setSaving(true)
    const { error } = await sb.from('organizations').update({
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim().toLowerCase(),
    }).eq('id', session.organizationId)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast('Organization contact info saved ✓')
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🏢 Organization Contact Info</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
        This contact name and email appear on the login page when a lab member asks for help signing in.
      </div>
      <div className="field">
        <label>Contact person's name</label>
        <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Dr. Smith" />
      </div>
      <div className="field">
        <label>Contact email address *</label>
        <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="admin@yourlab.edu" />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown on the login page and used as the reply-to address in notification emails.</div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save contact info'}
      </button>
    </div>
  )
}

// ── Org-level student default icons (set by org admin, pre-loaded in UserModal) ──
function StudentDefaultIconsPanel({ orgId }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return
    sb.from('organizations').select('student_default_modules').eq('id', orgId).maybeSingle()
      .then(({ data }) => {
        const mods = data?.student_default_modules?.length
          ? data.student_default_modules
          : ['projects', 'training', 'booking', 'equipmenthub', 'remessages']
        setSelected(new Set(mods))
      })
  }, [orgId])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const modules = STUDENT_ICON_OPTIONS.filter(m => selected.has(m.key)).map(m => m.key)
    const { error } = await sb.from('organizations').update({ student_default_modules: modules }).eq('id', orgId)
    if (error) toast('Save failed: ' + error.message)
    else toast('Default icons saved ✓ — new lab users will start with these icons.')
    setSaving(false)
  }

  if (!selected) return null

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>🎛 Default icons for new lab users</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
        These icons are pre-selected when a lab manager creates a new lab user. Profile is always included.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, border: '1.5px solid #1D9E75', background: '#E1F5EE', fontSize: 12, fontWeight: 500, color: '#0F6E56', cursor: 'default' }}>
          <span>👤</span><span>Profile</span><span style={{ fontSize: 10, opacity: 0.6 }}>🔒</span>
        </div>
        {STUDENT_ICON_OPTIONS.map(m => {
          const on = selected.has(m.key)
          return (
            <button key={m.key} type="button" onClick={() => toggle(m.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${on ? '#1D9E75' : 'var(--border)'}`, background: on ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: on ? '#0F6E56' : 'var(--text2)', transition: 'all 0.12s' }}>
              <span>{m.icon}</span><span>{m.label}</span>{on && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
            </button>
          )
        })}
      </div>
      <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save defaults'}
      </button>
    </div>
  )
}

const STUDENT_ICON_OPTIONS = [
  { key: 'projects',     label: 'Project & Material',   icon: '🧪' },
  { key: 'training',     label: 'Training Records',      icon: '🎓' },
  { key: 'equipmenthub', label: 'Equipment Hub',         icon: '📚' },
  { key: 'booking',      label: 'Booking Equipment',     icon: '📅' },
  { key: 'barcode',      label: 'QR Scan',               icon: '📷' },
  { key: 'remessages',   label: 'Contact Lab Manager',   icon: '💬' },
  { key: 'mileage',      label: 'Mileage Form',          icon: '🚗' },
  { key: 'labsafety',    label: 'Lab Safety',            icon: '🦺' },
]

// ── User modal ────────────────────────────────────────────────
function UserModal({ user, orgs, defaultOrgId, isSuperAdmin, defaultRole, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [name, setName]         = useState(user?.name || '')
  const [email, setEmail]       = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState(user?.role || defaultRole || 'user')
  const [orgId, setOrgId]       = useState(user?.organization_id || defaultOrgId || '')
  const [copied, setCopied]     = useState(false)
  const [savedCreds, setSavedCreds] = useState(null)
  // profile is always locked on; start empty otherwise (loaded from org defaults or existing prefs)
  const [selectedIcons, setSelectedIcons] = useState(new Set(['profile']))

  const effectiveOrgId = orgId || defaultOrgId

  // Load icons: org defaults for new student, existing prefs for edit
  useEffect(() => {
    if (user?.id && user?.role === 'student') {
      sb.from('user_dashboard_prefs').select('active_modules').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => {
          const mods = data?.active_modules?.length ? data.active_modules : []
          setSelectedIcons(new Set([...mods, 'profile']))
        })
    } else if (!user && role === 'student' && effectiveOrgId) {
      sb.from('organizations').select('student_default_modules').eq('id', effectiveOrgId).maybeSingle()
        .then(({ data }) => {
          const defaults = data?.student_default_modules?.length
            ? data.student_default_modules
            : ['projects', 'training', 'booking', 'equipmenthub', 'remessages']
          setSelectedIcons(new Set([...defaults, 'profile']))
        })
    } else if (!user && role === 'student') {
      setSelectedIcons(new Set(['projects', 'training', 'booking', 'equipmenthub', 'remessages', 'profile']))
    }
  }, [user?.id, user?.role, role, effectiveOrgId])

  function toggleIcon(key) {
    if (key === 'profile') return // always locked
    setSelectedIcons(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      next.add('profile')
      return next
    })
  }

  async function saveIconPrefs(userId) {
    const modules = ['profile', ...STUDENT_ICON_OPTIONS.filter(m => selectedIcons.has(m.key)).map(m => m.key)]
    const { data: existing } = await sb.from('user_dashboard_prefs').select('id').eq('user_id', userId).maybeSingle()
    if (existing) {
      await sb.from('user_dashboard_prefs').update({ active_modules: modules, has_set_dashboard: true }).eq('user_id', userId)
    } else {
      await sb.from('user_dashboard_prefs').insert({ user_id: userId, active_modules: modules, has_set_dashboard: true })
    }
  }

  async function save() {
    if (!name.trim())    { toast('Please enter a name.'); return }
    if (!orgId)          { toast('Please select an organization.'); return }
    if (!user && !email.trim()) { toast('Please enter an email address.'); return }
    if (password) {
      if (password.length < 8)        { toast('Password must be at least 8 characters.'); return }
      if (!/[A-Z]/.test(password))    { toast('Password must contain an uppercase letter.'); return }
      if (!/[a-z]/.test(password))    { toast('Password must contain a lowercase letter.'); return }
      if (!/[^A-Za-z0-9]/.test(password)) { toast('Password must contain a symbol (e.g. !@#$%).'); return }
    }

    if (user) {
      const upd = { name: name.trim(), email: email.trim().toLowerCase() || null, role, organization_id: orgId, is_active: true }
      if (password) upd.must_change_password = true
      const { error } = await sb.from('users').update(upd).eq('id', user.id)
      if (error) { toast('Error updating user: ' + error.message); return }
      if (role === 'student') await saveIconPrefs(user.id)
      if (password) toast('User updated. Password will be required to change on next login.')
      else toast('User updated.')
      onSaved(); onClose()
    } else {
      const emailLC = email.trim().toLowerCase()
      const tempPassword = generateTempPassword()
      let auth_id = null
      try {
        const authUser = await createAuthUser(emailLC, tempPassword)
        if (authUser) auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }

      // Plain insert — don't use .single() which fails under RLS
      const { error } = await sb.from('users').insert({
        name: name.trim(), email: emailLC, auth_id, role,
        organization_id: orgId, is_active: true, must_change_password: true,
      })
      if (error) { toast('Error creating user: ' + error.message); return }

      // Fetch the new user's ID to save icon prefs
      if (role === 'student') {
        const { data: newUser } = await sb.from('users').select('id').ilike('email', emailLC).maybeSingle()
        if (newUser?.id) await saveIconPrefs(newUser.id)
      }
      setSavedCreds({ name: name.trim(), email: emailLC, password: tempPassword })
      onSaved()
    }
  }

  function copyCredentials() {
    const orgName = orgs.find(o => o.id === orgId)?.name || ''
    const text = `iLab Login Credentials\nOrganization: ${orgName}\nEmail: ${savedCreds.email}\nPassword: ${savedCreds.password}\n\nPlease log in and change your password on first sign-in.`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (savedCreds) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>User created</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Copy these credentials and send to the user</div>
      </div>
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontFamily: 'var(--mono)', fontSize: 13 }}>
        <div><strong>Email:</strong> {savedCreds.email}</div>
        <div style={{ marginTop: 6 }}><strong>Password:</strong> {savedCreds.password}</div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>User will be forced to change password on first login.</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={copyCredentials}>
          {copied ? '✓ Copied!' : '📋 Copy credentials'}
        </button>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{user ? 'Edit user' : 'Add new user'}</div>

      <div className="field"><label>Full name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr. Smith" autoFocus />
      </div>
      <div className="field"><label>Email * (used to sign in)</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
      </div>
      {user && (
        <div className="field">
          <label>Reset password (leave blank to keep current)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          <PasswordStrengthHint password={password} />
        </div>
      )}
      {!user && (
        <div style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          🔑 A secure temporary password will be auto-generated. The user must change it on first login.
        </div>
      )}

      <div className="grid-2">
        <div className="field"><label>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="user">Lab Manager</option>
            <option value="admin">Org Admin</option>
            <option value="student">Lab User</option>
          </select>
        </div>
        {isSuperAdmin && (
          <div className="field"><label>Organization *</label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)}>
              <option value="">— Select org —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {role === 'student' && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Dashboard icons for this lab user
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* Profile — always locked on */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1.5px solid #1D9E75', background: '#E1F5EE', fontSize: 12, fontWeight: 500, color: '#0F6E56', cursor: 'default' }}>
              <span>👤</span><span>Profile</span><span style={{ fontSize: 10, opacity: 0.6 }}>🔒</span>
            </div>
            {STUDENT_ICON_OPTIONS.map(m => {
              const on = selectedIcons.has(m.key)
              return (
                <button key={m.key} type="button" onClick={() => toggleIcon(m.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#1D9E75' : 'var(--border)'}`,
                    background: on ? '#E1F5EE' : 'var(--surface)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, color: on ? '#0F6E56' : 'var(--text2)',
                    transition: 'all 0.12s',
                  }}>
                  <span>{m.icon}</span><span>{m.label}</span>
                  {on && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
            Profile is always included. Defaults are set by your org admin in the Lab Users tab.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>
          {user ? 'Save changes' : 'Create user'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Org modules modal (super admin only) ─────────────────────
const ORG_CONFIGURABLE_MODULES = ALL_MODULES_META.filter(m => m.key !== 'profile')

// ── Shared image grid for global icon images ──────────────────
function GlobalImageGrid({ modules, imagePrefix }) {
  const { toast } = useAppStore()
  const [images, setImages] = useState(null)
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})

  useEffect(() => {
    const keys = modules.map(m => `${imagePrefix}${m.key}`)
    sb.from('settings').select('key, value').in('key', keys)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.key.replace(imagePrefix, '')] = r.value })
        setImages(map)
      })
  }, [])

  async function handleUpload(m, file) {
    if (!file) return
    setUploading(m.key)
    try {
      const compressed = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('File read failed'))
        reader.onload = e => {
          const img = new Image()
          img.onerror = () => reject(new Error('Image render failed'))
          img.onload = () => {
            const W = 800, H = 500
            const canvas = document.createElement('canvas')
            canvas.width = W; canvas.height = H
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#111'
            ctx.fillRect(0, 0, W, H)
            const scale = Math.max(W / img.width, H / img.height)
            const sw = img.width * scale, sh = img.height * scale
            ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.85)
          }
          img.src = e.target.result
        }
        reader.readAsDataURL(file)
      })
      const path = `module-images/global/${imagePrefix}${m.key}-${Date.now()}.jpg`
      const { error: upErr } = await sb.storage.from('project-files').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { toast('Upload failed: ' + upErr.message); return }
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
      const url = urlData.publicUrl
      const { error } = await sb.from('settings').upsert({ key: `${imagePrefix}${m.key}`, value: url }, { onConflict: 'key' })
      if (error) { toast('Save failed: ' + error.message); return }
      setImages(prev => ({ ...prev, [m.key]: url }))
      toast(`${m.label} image saved ✓`)
    } catch (e) { toast('Upload failed: ' + (e?.message || e)) }
    finally {
      setUploading(null)
      if (fileRefs.current[m.key]) fileRefs.current[m.key].value = ''
    }
  }

  async function clearImage(m) {
    await sb.from('settings').delete().eq('key', `${imagePrefix}${m.key}`)
    setImages(prev => { const n = { ...prev }; delete n[m.key]; return n })
    toast(`${m.label} image removed.`)
  }

  if (images === null) return <div className="spinner" style={{ margin: '20px auto' }} />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {modules.map(m => {
        const currentUrl = images[m.key]
        const isUploading = uploading === m.key
        return (
          <div key={m.key} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
            <div style={{ height: 80, position: 'relative', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentUrl
                ? <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                : <div style={{ fontSize: 26, opacity: 0.35 }}>{m.icon}</div>
              }
              {currentUrl && (
                <button onClick={() => clearImage(m)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 4, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
              )}
              {isUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              )}
            </div>
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
              <button className="btn btn-sm btn-primary" disabled={isUploading} onClick={() => fileRefs.current[m.key]?.click()} style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }}>
                {currentUrl ? '↑' : '+'}
              </button>
              <input type="file" accept="image/*,.svg" ref={el => fileRefs.current[m.key] = el} style={{ display: 'none' }} onChange={e => handleUpload(m, e.target.files[0])} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── App-level modules modal (super admin only) ────────────────
function AppModulesModal({ onClose }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('icons')

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = data?.value ? JSON.parse(data.value) : null
          setSelected(parsed ? new Set(parsed) : new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))
        } catch {
          setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))
        }
      })
  }, [])

  function toggle(key) {
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const allKeys = ORG_CONFIGURABLE_MODULES.map(m => m.key)
    const selectedKeys = allKeys.filter(k => selected.has(k))
    const toSave = selectedKeys.length === allKeys.length ? null : selectedKeys
    const value = toSave === null ? null : JSON.stringify(toSave)
    if (value === null) {
      await sb.from('settings').delete().eq('key', 'app_allowed_modules')
    } else {
      const { error } = await sb.from('settings').upsert({ key: 'app_allowed_modules', value }, { onConflict: 'key' })
      if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    }
    toast('Global app icon access saved.')
    onClose()
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === key ? 'var(--accent)' : 'var(--surface2)', color: tab === key ? '#fff' : 'var(--text2)' }}>{label}</button>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Dashboard Icons — Main App (Global)</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
        Control which icons are available across the entire app, and optionally upload background images for each icon card.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>{tabBtn('icons', 'Icon Access')}{tabBtn('images', 'Icon Images')}</div>

      {tab === 'icons' && (
        selected === null ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={() => setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))}>Select all</button>
              <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: '55vh', overflowY: 'auto' }}>
              {ORG_CONFIGURABLE_MODULES.map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${selected.has(m.key) ? 'var(--accent)' : 'var(--border)'}`, background: selected.has(m.key) ? 'var(--accent-light)' : 'var(--surface)' }}>
                  <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.sub}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving || selected === null}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )
      )}

      {tab === 'images' && (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            These images appear as backgrounds on dashboard icon cards for all team users. Best size: landscape ~800×500 px. Org admins can override images for their own organization.
          </div>
          <GlobalImageGrid modules={ORG_CONFIGURABLE_MODULES} imagePrefix="img_" />
        </div>
      )}
    </Modal>
  )
}

// ── Solo users global modules modal (super admin only) ────────
const SOLO_CONFIGURABLE_MODULES = ALL_MODULES_META.filter(m => !m.soloLocked && m.key !== 'profile')

function SoloModulesModal({ onClose }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('icons')

  useEffect(() => {
    sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle()
      .then(({ data }) => {
        try {
          const parsed = data?.value ? JSON.parse(data.value) : null
          setSelected(parsed ? new Set(parsed) : new Set(SOLO_CONFIGURABLE_MODULES.map(m => m.key)))
        } catch {
          setSelected(new Set(SOLO_CONFIGURABLE_MODULES.map(m => m.key)))
        }
      })
  }, [])

  function toggle(key) {
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const allKeys = SOLO_CONFIGURABLE_MODULES.map(m => m.key)
    const selectedKeys = allKeys.filter(k => selected.has(k))
    const toSave = selectedKeys.length === allKeys.length ? null : selectedKeys
    const value = toSave === null ? null : JSON.stringify(toSave)
    if (value === null) {
      await sb.from('settings').delete().eq('key', 'solo_allowed_modules')
    } else {
      const { error } = await sb.from('settings').upsert({ key: 'solo_allowed_modules', value }, { onConflict: 'key' })
      if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    }
    toast('Solo user icon access saved.')
    onClose()
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{ padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === key ? '#534AB7' : 'var(--surface2)', color: tab === key ? '#fff' : 'var(--text2)' }}>{label}</button>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Dashboard Icons — Solo Users (Global)</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
        Control which icons solo users can see, and optionally upload background images for each icon card.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>{tabBtn('icons', 'Icon Access')}{tabBtn('images', 'Icon Images')}</div>

      {tab === 'icons' && (
        selected === null ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={() => setSelected(new Set(SOLO_CONFIGURABLE_MODULES.map(m => m.key)))}>Select all</button>
              <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: '55vh', overflowY: 'auto' }}>
              {SOLO_CONFIGURABLE_MODULES.map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${selected.has(m.key) ? '#534AB7' : 'var(--border)'}`, background: selected.has(m.key) ? '#EEEDFE' : 'var(--surface)' }}>
                  <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} style={{ width: 16, height: 16, accentColor: '#534AB7' }} />
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.sub}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} disabled={saving || selected === null}
                style={{ padding: '9px 22px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: (saving || selected === null) ? 'not-allowed' : 'pointer', opacity: (saving || selected === null) ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )
      )}

      {tab === 'images' && (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
            These images appear as backgrounds on dashboard icon cards for all solo users. Best size: landscape ~800×500 px.
          </div>
          <GlobalImageGrid modules={SOLO_CONFIGURABLE_MODULES} imagePrefix="solo_img_" />
        </div>
      )}
    </Modal>
  )
}

function OrgModulesModal({ org, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    sb.from('organizations').select('allowed_modules').eq('id', org.id).maybeSingle()
      .then(({ data }) => {
        if (data?.allowed_modules) {
          setSelected(new Set(data.allowed_modules))
        } else {
          setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))
        }
      })
  }, [org.id])

  function toggle(key) {
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    setSaving(true)
    const allKeys = ORG_CONFIGURABLE_MODULES.map(m => m.key)
    const selectedKeys = allKeys.filter(k => selected.has(k))
    const toSave = selectedKeys.length === allKeys.length ? null : selectedKeys
    const { error } = await sb.from('organizations').update({ allowed_modules: toSave }).eq('id', org.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast(`Icon access saved for ${org.name}`)
    onSaved(); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Dashboard Icons — {org.name}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.6 }}>
        Select which icons the org admin of this organization can enable on their dashboard. Unchecked icons will be hidden for all users in this org.
      </div>
      {selected === null ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => setSelected(new Set(ORG_CONFIGURABLE_MODULES.map(m => m.key)))}>Select all</button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear all</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: '55vh', overflowY: 'auto' }}>
            {ORG_CONFIGURABLE_MODULES.map(m => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${selected.has(m.key) ? 'var(--accent)' : 'var(--border)'}`, background: selected.has(m.key) ? 'var(--accent-light)' : 'var(--surface)' }}>
                <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || selected === null}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Org modal (super admin only) ──────────────────────────────
function OrgModal({ org, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [name, setName] = useState(org?.name || '')
  const [slug, setSlug] = useState(org?.slug || '')

  function autoSlug(n) { return n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }

  async function save() {
    if (!name.trim()) { toast('Please enter an organization name.'); return }
    const s = slug.trim() || autoSlug(name)
    if (!s) { toast('Please enter a slug.'); return }
    if (org) {
      const { error } = await sb.from('organizations').update({ name: name.trim(), slug: s }).eq('id', org.id)
      if (error) { toast('Error: ' + error.message); return }
    } else {
      const { error } = await sb.from('organizations').insert({ name: name.trim(), slug: s })
      if (error) { toast('Error: ' + error.message); return }
    }
    toast('Organization saved.')
    onSaved()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{org ? 'Edit organization' : 'New organization'}</div>
      <div className="field"><label>Organization name *</label>
        <input value={name} onChange={e => { setName(e.target.value); if (!org) setSlug(autoSlug(e.target.value)) }} placeholder="e.g. ICT Lab" autoFocus />
      </div>
      <div className="field"><label>Slug (URL-safe identifier)</label>
        <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. ict-lab" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>{org ? 'Save' : 'Create organization'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ── Screen access modal ───────────────────────────────────────
// Derived from dashboard module list — team only, no external links, no profile
const ALL_SCREENS = ALL_MODULES_META
  .filter(m => m.roles.includes('team') && m.screen && !m.external && m.key !== 'profile')
  .map(m => ({ key: m.screen, label: m.label, icon: m.icon }))

function AccessModal({ user, onClose, onSaved }) {
  const { toast } = useAppStore()
  const [granted, setGranted] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.from('user_screen_access').select('screen_key').eq('user_id', user.id)
      .then(({ data }) => {
        setGranted(new Set((data || []).map(r => r.screen_key)))
        setLoading(false)
      })
  }, [user.id])

  function toggle(key) {
    setGranted(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function save() {
    await sb.from('user_screen_access').delete().eq('user_id', user.id)
    if (granted.size > 0) {
      const rows = [...granted].map(key => ({ user_id: user.id, screen_key: key, organization_id: user.organization_id || null }))
      await sb.from('user_screen_access').insert(rows)
    }
    toast('Access saved.')
    onSaved()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Screen access — {user.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>Dashboard, Profile, PM, and Barcode are always available.</div>
      {loading ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {ALL_SCREENS.map(s => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${granted.has(s.key) ? 'var(--accent)' : 'var(--border)'}`, background: granted.has(s.key) ? 'var(--accent-light)' : 'var(--surface)' }}>
              <input type="checkbox" checked={granted.has(s.key)} onChange={() => toggle(s.key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save}>Save access</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function Admin() {
  const { session, toast, pendingAdminTab, setPendingAdminTab } = useAppStore()
  const isSuperAdmin = !session?.userId   // logged in via /admin password
  const myOrgId = session?.organizationId || null

  const [tab, setTab] = useState(isSuperAdmin ? 'organizations' : 'users')

  useEffect(() => {
    if (pendingAdminTab) {
      setTab(pendingAdminTab)
      setPendingAdminTab(null)
    }
  }, [pendingAdminTab])
  const [users, setUsers]     = useState([])
  const [orgs, setOrgs]       = useState([])
  const [orgCounts, setOrgCounts] = useState({})
  const [orgAdmins, setOrgAdmins] = useState([])
  const [search, setSearch]   = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [userModal, setUserModal]               = useState(null)
  const [orgModal, setOrgModal]                 = useState(null)
  const [accessModal, setAccessModal]           = useState(null)
  const [orgModulesModal, setOrgModulesModal]   = useState(null)
  const [appModulesOpen, setAppModulesOpen]     = useState(false)
  const [soloModulesOpen, setSoloModulesOpen]   = useState(false)

  // Super admin: images tab is accessed standalone (no tab bar), so exclude it from the tab list
  const tabs = isSuperAdmin
    ? [{ key: 'organizations', label: 'Organizations' }]
    : [{ key: 'users', label: 'Lab Managers' }, { key: 'students', label: 'Lab Users' }, { key: 'images', label: 'Module Images' }, { key: 'orgsettings', label: 'Org Settings' }]

  useEffect(() => { loadOrgs() }, [])
  useEffect(() => {
    if (tab === 'users' || tab === 'students') loadUsers()
    setSelectedIds(new Set())
  }, [tab, orgFilter])

  async function loadOrgs() {
    const [{ data: orgData }, { data: countData }, { data: adminData }] = await Promise.all([
      sb.from('organizations').select('*').order('name'),
      sb.from('users').select('organization_id').not('organization_id', 'is', null),
      sb.from('users').select('id, name, email, organization_id, is_active').eq('role', 'admin').not('organization_id', 'is', null),
    ])
    setOrgs(orgData || [])
    const counts = {}
    ;(countData || []).forEach(u => { counts[u.organization_id] = (counts[u.organization_id] || 0) + 1 })
    setOrgCounts(counts)
    setOrgAdmins(adminData || [])
  }

  async function loadUsers() {
    setLoading(true)
    let q = sb.from('users').select('*').order('name')
    if (isSuperAdmin) {
      // Super admin only sees org admins across all orgs
      q = q.eq('role', 'admin')
      if (orgFilter) q = q.eq('organization_id', orgFilter)
    } else {
      // Org admin sees their own org's users
      if (tab === 'students') q = q.eq('role', 'student')
      else q = q.in('role', ['user', 'admin'])
      q = q.eq('organization_id', myOrgId)
    }
    const { data } = await q
    setUsers(data || [])
    setLoading(false)
  }

  async function deactivateUser(u) {
    await sb.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    loadUsers()
    toast(u.is_active ? 'User deactivated.' : 'User activated.')
  }

  async function deleteUser(user) {
    if (!confirm('Delete this user permanently?')) return
    // Always delete auth account so the email can be reused
    if (user.auth_id) {
      await sb.rpc('delete_auth_user', { p_auth_id: user.auth_id }).catch(() => {})
    }
    if (isSuperAdmin) {
      const { error } = await sb.rpc('delete_user_account', {
        p_user_id: user.id,
        p_auth_id: user.auth_id || null,
      })
      if (error) { toast('Delete failed: ' + error.message); return }
    } else {
      const { error } = await sb.from('users').delete().eq('id', user.id)
      if (error) { toast('Delete failed: ' + error.message); return }
    }
    loadUsers()
    toast('User deleted.')
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)))
    }
  }

  async function deleteSelected() {
    if (!selectedIds.size) return
    if (!confirm(`Delete ${selectedIds.size} lab user(s) permanently? This cannot be undone.`)) return
    const ids = Array.from(selectedIds)
    const { error } = await sb.from('users').delete().in('id', ids)
    if (error) { toast('Delete failed: ' + error.message); return }
    setSelectedIds(new Set())
    loadUsers()
    toast(`${ids.length} user(s) deleted.`)
  }

  async function deleteOrg(id) {
    if (!confirm('Delete this organization? All linked users will lose their org assignment.')) return
    const { error: unlinkErr } = await sb.from('users').update({ organization_id: null }).eq('organization_id', id)
    if (unlinkErr) { toast('Delete failed: ' + unlinkErr.message); return }
    const { error } = await sb.from('organizations').delete().eq('id', id)
    if (error) { toast('Delete failed: ' + error.message); return }
    loadOrgs(); loadUsers()
    toast('Organization deleted.')
  }

  const orgName = (id) => orgs.find(o => o.id === id)?.name || '—'

  const filteredUsers = users.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>
            {isSuperAdmin ? 'Super Admin Panel' : 'Organization Admin Panel'}
          </div>
          {!isSuperAdmin && myOrgId && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Managing: {orgName(myOrgId)}</div>
          )}
        </div>
      </div>

      {/* Tabs — only shown for org admins, not super admin */}
      {!isSuperAdmin && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '7px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t.key ? 'var(--accent)' : 'var(--surface2)', color: tab === t.key ? '#fff' : 'var(--text2)' }}>
              {t.label}
            </button>
          ))}
        </div>
      )}



      {/* ── USERS / STUDENTS (org admin only) ── */}
      {!isSuperAdmin && (tab === 'users' || tab === 'students') && (
        <div>
          {tab === 'students' && <StudentDefaultIconsPanel orgId={myOrgId} />}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btn-primary btn-sm" onClick={() => setUserModal('add')}>
              + Add {tab === 'students' ? 'lab user' : 'lab manager'}
            </button>
          </div>
          {tab === 'students' && filteredUsers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                {selectedIds.size === filteredUsers.length ? 'Deselect all' : 'Select all'} ({filteredUsers.length})
              </label>
              {selectedIds.size > 0 && (
                <button className="btn btn-sm btn-danger" onClick={deleteSelected} style={{ marginLeft: 'auto' }}>
                  Delete selected ({selectedIds.size})
                </button>
              )}
            </div>
          )}
          {loading ? (
            <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">👤</div>No users found.</div>
          ) : (
            filteredUsers.map(u => (
              <div key={u.id} className="card" style={{ padding: '12px 18px', marginBottom: 10, opacity: u.is_active ? 1 : 0.55, outline: tab === 'students' && selectedIds.has(u.id) ? '2px solid var(--accent)' : 'none', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {tab === 'students' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: u.role === 'admin' ? '#FEF3C7' : u.role === 'student' ? '#EDE9FE' : '#E1F5EE', color: u.role === 'admin' ? '#92400E' : u.role === 'student' ? '#5B21B6' : '#065F46', fontWeight: 600 }}>
                        {u.role === 'admin' ? 'Org Admin' : u.role === 'student' ? 'Lab User' : 'Lab Manager'}
                      </span>
                      {!u.is_active && <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 500 }}>Inactive</span>}
                      {u.must_change_password && <span style={{ fontSize: 11, color: '#D97706', fontWeight: 500 }}>⚠ Temp password</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                      {u.email && <span>{u.email}</span>}
                    </div>
                  </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {u.role !== 'admin' && tab === 'users' && <button className="btn btn-sm" onClick={() => setAccessModal(u)}>Access</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm" onClick={() => setUserModal(u)}>Edit</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm" onClick={() => deactivateUser(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>}
                    {u.role !== 'admin' && <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u)}>Delete</button>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── MODULE IMAGES ── */}
      {tab === 'images' && <ModuleImagesPanel orgId={myOrgId} />}

      {/* ── ORG SETTINGS (org admin only) ── */}
      {!isSuperAdmin && tab === 'orgsettings' && <OrgSettingsPanel session={session} />}

      {/* ── ORGANIZATIONS (super admin only) ── */}
      {isSuperAdmin && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setOrgModal('add')}>+ New organization</button>
          </div>

          {/* Global app-level icon restriction */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 10, border: '1.5px solid var(--accent)', background: 'var(--accent-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <button onClick={() => setAppModulesOpen(true)} style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                  🌐 Main App (Global)
                </button>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Global icon pool — applies to all organizations as the outermost boundary
                </div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setAppModulesOpen(true)}>Icons</button>
            </div>
          </div>

          {/* Global solo users icon restriction */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 16, border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <button onClick={() => setSoloModulesOpen(true)} style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: '#534AB7', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                  👤 Solo Users (Global)
                </button>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  Icons available to all solo user accounts across the app
                </div>
              </div>
              <button onClick={() => setSoloModulesOpen(true)} style={{ padding: '5px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Icons</button>
            </div>
          </div>

          {orgs.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏢</div>No organizations yet.</div>
          ) : orgs.map(o => {
            const count = orgCounts[o.id] || 0
            const admins = orgAdmins.filter(a => a.organization_id === o.id)
            return (
              <div key={o.id} className="card" style={{ padding: '14px 18px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <button onClick={() => setOrgModulesModal(o)} style={{ fontWeight: 600, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                      {o.name}
                    </button>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {o.slug} · {count} user{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {admins.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {admins.map(a => (
                          <button key={a.id} onClick={() => setUserModal(a)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>Admin</span>
                              {a.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="btn btn-sm" onClick={() => setOrgModulesModal(o)}>Icons</button>
                    <button className="btn btn-sm" onClick={() => setOrgModal(o)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteOrg(o.id)}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODALS ── */}
      {userModal && (
        <UserModal
          user={userModal === 'add' ? null : userModal}
          orgs={orgs}
          defaultOrgId={isSuperAdmin ? orgFilter : myOrgId}
          isSuperAdmin={isSuperAdmin}
          defaultRole={isSuperAdmin ? 'admin' : 'user'}
          onClose={() => setUserModal(null)}
          onSaved={loadUsers}
        />
      )}
      {orgModal && (
        <OrgModal
          org={orgModal === 'add' ? null : orgModal}
          onClose={() => setOrgModal(null)}
          onSaved={loadOrgs}
        />
      )}
      {accessModal && (
        <AccessModal
          user={accessModal}
          onClose={() => setAccessModal(null)}
          onSaved={loadUsers}
        />
      )}
      {orgModulesModal && (
        <OrgModulesModal
          org={orgModulesModal}
          onClose={() => setOrgModulesModal(null)}
          onSaved={loadOrgs}
        />
      )}
      {appModulesOpen && (
        <AppModulesModal onClose={() => setAppModulesOpen(false)} />
      )}
      {soloModulesOpen && (
        <SoloModulesModal onClose={() => setSoloModulesOpen(false)} />
      )}
    </div>
  )
}
