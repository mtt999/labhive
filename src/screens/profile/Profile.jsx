import HelpPanel from '../../components/HelpPanel'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import DashboardIconPicker, { ALL_MODULES_META, PINNED_MODULES } from '../../components/DashboardIconPicker'
import StudentIconManager from '../../components/StudentIconManager'
import TeammatesPanel from '../../components/TeammatesPanel'
import TeamMembersPanel from '../../components/TeamMembersPanel'

const PROJECT_GROUPS = ['Material', 'Sustainability', 'GPR', 'Mechanic', 'Other']
const DEGREES = ['MS', 'PhD', 'BS', 'Other']
const SEMESTERS = ['Fall', 'Spring', 'Summer']
const YEARS = Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() - i))

const groupColor = { Material: '#92400e', Sustainability: '#1e4d39', GPR: '#0369a1', Mechanic: '#7c4dbd', Other: '#6b6860' }
const groupBg   = { Material: '#fef3c7', Sustainability: '#e8f2ee', GPR: '#e0f2fe', Mechanic: '#f3eeff', Other: '#f0efe9' }

const sFirstName  = s => s?.email  || ''
const sLastName   = s => s?.name   || ''
const sEmail      = s => s?.phone  || ''
const sSupervisor = s => s?.degree || s?.supervisor || ''

async function createAuthUser(email, password) {
  const { data: { session: prev } } = await sb.auth.getSession()
  const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
  if (prev) await sb.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token })
  if (error) throw error
  return data.user
}

// ══════════════════════════════════════════════════════════════
// [TeammatesPanel imported from components/TeammatesPanel.jsx]
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// SOLO PROFILE — reads from solo_users table
// ══════════════════════════════════════════════════════════════
function SoloProfile({ session }) {
  const { toast, setSession } = useAppStore()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [form, setForm] = useState({})
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' })
  const [pinError, setPinError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    if (!session?.userId) { setLoading(false); return }
    const { data } = await sb.from('solo_users').select('*').eq('id', session.userId).maybeSingle()
    setUser(data)
    if (data) setForm({
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      photo_url: data.photo_url || '',
    })
    setLoading(false)
  }

  async function saveInfo() {
    setSaving(true)
    const { error } = await sb.from('solo_users').update({
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      photo_url: form.photo_url || null,
    }).eq('id', user.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    setSession({ ...session, username: form.name.trim(), photoUrl: form.photo_url || null })
    toast('Profile saved ✓'); setSaving(false); load()
  }

  async function savePassword() {
    setPinError('')
    if (!pinForm.current) { setPinError('Enter your current password.'); return }
    if (!pinForm.newPin || pinForm.newPin.length < 6) { setPinError('Min 6 characters.'); return }
    if (pinForm.newPin !== pinForm.confirm) { setPinError('Passwords do not match.'); return }
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email: session.email, password: pinForm.current })
    if (reAuthErr) { setPinError('Current password is incorrect.'); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: pinForm.newPin })
    if (updateErr) { setPinError('Failed to update. Try again.'); return }
    toast('Password updated ✓'); setPinForm({ current: '', newPin: '', confirm: '' })
  }

  async function uploadPhoto(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(), url = URL.createObjectURL(file)
        img.onload = () => {
          const s = Math.min(1, 400 / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `avatars/solo_${user.id}_${Date.now()}.jpg`
      const { error: uploadErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw uploadErr
      const photoUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      await sb.from('solo_users').update({ photo_url: photoUrl }).eq('id', user.id)
      setForm(f => ({ ...f, photo_url: photoUrl }))
      setSession({ ...session, photoUrl })
      toast('Photo saved ✓')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!user) return <div className="empty-state"><div className="empty-icon">👤</div>Profile not found.</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">My Profile</div>
        <HelpPanel screen="profile" />
      </div>

      {/* Avatar card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{form.name || user.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{form.email || user.email}</div>
          <span style={{ display: 'inline-block', marginTop: 6, background: '#EEEDFE', color: '#534AB7', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Solo</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {[
          { key: 'info',          label: '👤 My Info' },
          { key: 'teammates',     label: '👥 Teammates' },
          { key: 'dashboard',     label: '🎛️ Dashboard Icons' },
          { key: 'notifications', label: '🔔 Notifications' },
          { key: 'password',      label: '🔑 Password' },
          { key: 'photo',         label: '🖼️ Photo' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '10px 22px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? '#534AB7' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? '#534AB7' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="card">
          <div className="field"><label>Full Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="field"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <button className="btn btn-primary" onClick={saveInfo} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      {activeTab === 'teammates' && <TeammatesPanel session={session} />}

      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}

      {activeTab === 'notifications' && <NotificationPrefsPanel userId={session?.userId} role="solo" />}

      {activeTab === 'password' && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Minimum 6 characters.</div>
          <div className="field"><label>Current password</label><input type="password" value={pinForm.current} onChange={e => { setPinForm(f => ({ ...f, current: e.target.value })); setPinError('') }} /></div>
          <div className="grid-2">
            <div className="field"><label>New password</label><input type="password" value={pinForm.newPin} onChange={e => { setPinForm(f => ({ ...f, newPin: e.target.value })); setPinError('') }} /></div>
            <div className="field"><label>Confirm</label><input type="password" value={pinForm.confirm} onChange={e => { setPinForm(f => ({ ...f, confirm: e.target.value })); setPinError('') }} /></div>
          </div>
          {pinError && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {pinError}</div>}
          <button className="btn btn-primary" onClick={savePassword} disabled={!pinForm.current || !pinForm.newPin || !pinForm.confirm}>Update password</button>
        </div>
      )}

      {activeTab === 'photo' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Current photo</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Saves automatically after upload.</div>
            </div>
            {form.photo_url && (
              <button className="btn btn-sm" onClick={async () => {
                await sb.from('solo_users').update({ photo_url: null }).eq('id', user.id)
                setForm(f => ({ ...f, photo_url: '' }))
                setSession({ ...session, photoUrl: null })
                toast('Photo removed.')
              }}>Remove</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
          <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Uploading…' : '⬆️ Choose photo'}</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD ICONS MANAGER — works for all roles
// ══════════════════════════════════════════════════════════════
function DashboardIconsPanel({ session }) {
  const { toast, setActiveModules } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const loginMode = session?.loginMode || 'team'

  const roleKey = loginMode === 'solo' ? 'solo' : 'team'
  const isStaff = session?.role === 'admin' || session?.role === 'user'
  const available = ALL_MODULES_META.filter(m => m.roles.includes(roleKey) && (!m.hideForStaff || !isStaff))

  const [selected, setSelected] = useState(null)
  const [displayOrder, setDisplayOrder] = useState(null)
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const dragKeyRef = useRef(null)
  const [allowedPool, setAllowedPool] = useState(null)
  const [adminPool, setAdminPool] = useState(null) // pool set by super admin (solo or org+app)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [session?.userId])

  function initOrder(savedModules, allKeys) {
    if (savedModules?.length) {
      return [...savedModules.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !savedModules.includes(k))]
    }
    return allKeys
  }

  async function load() {
    const allKeys = available.map(m => m.key)
    try {
      if (!session?.userId) {
        const saved = localStorage.getItem('ilab_admin_modules')
        const savedArr = saved ? JSON.parse(saved) : null
        setSelected(new Set(savedArr?.length ? savedArr : allKeys))
        setDisplayOrder(initOrder(savedArr, allKeys))
        return
      }
      if (isSolo) {
        const [soloRes, settingsRes] = await Promise.all([
          sb.from('solo_users').select('active_modules').eq('id', session.userId).maybeSingle(),
          sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle(),
        ])
        let pool = null
        try { pool = settingsRes?.data?.value ? JSON.parse(settingsRes.data.value) : null } catch {}
        setAdminPool(pool)
        const displayKeys = pool !== null ? allKeys.filter(k => pool.includes(k) || k === 'profile') : allKeys
        const savedArr = soloRes.data?.active_modules?.length
          ? soloRes.data.active_modules.filter(k => displayKeys.includes(k))
          : null
        setSelected(new Set(savedArr || displayKeys))
        setDisplayOrder(initOrder(savedArr, displayKeys))
      } else {
        const [prefsRes, orgRes, appRes] = await Promise.all([
          sb.from('user_dashboard_prefs').select('active_modules, allowed_modules').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(1),
          session?.organizationId
            ? sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
            : Promise.resolve(null),
          sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle(),
        ])
        const data = prefsRes.data?.[0] ?? null
        let appPool = null
        try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch {}
        const orgPool = orgRes?.data?.allowed_modules || null
        // Org pool overrides global pool; global is the default when no org pool is set
        const effectivePool = orgPool ?? appPool
        setAdminPool(effectivePool)
        if (session?.role === 'student') {
          const pool = data?.allowed_modules || []
          setAllowedPool(pool)
          const poolKeys = effectivePool !== null ? pool.filter(k => effectivePool.includes(k)) : pool
          const savedArr = data?.active_modules?.length
            ? data.active_modules.filter(k => poolKeys.includes(k) || PINNED_MODULES.includes(k))
            : poolKeys
          setSelected(new Set(savedArr))
          setDisplayOrder(initOrder(savedArr, poolKeys))
        } else {
          const displayKeys = effectivePool !== null ? allKeys.filter(k => effectivePool.includes(k) || k === 'profile') : allKeys
          const savedArr = data?.active_modules?.length
            ? data.active_modules.filter(k => displayKeys.includes(k))
            : null
          setSelected(new Set(savedArr || displayKeys))
          setDisplayOrder(initOrder(savedArr, displayKeys))
        }
      }
    } catch (e) {
      setSelected(new Set(allKeys))
      setDisplayOrder(allKeys)
    }
  }

  function toggle(key) {
    if (PINNED_MODULES.includes(key)) return
    if (isSolo && ALL_MODULES_META.find(m => m.key === key)?.soloLocked) return
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    const order = displayOrder || Array.from(selected)
    const soloLockedKeys = new Set(ALL_MODULES_META.filter(m => m.soloLocked).map(m => m.key))
    const modules = order.filter(k => selected.has(k) && !(isSolo && soloLockedKeys.has(k)))
    try {
      if (!session?.userId) {
        localStorage.setItem('ilab_admin_modules', JSON.stringify(modules))
        localStorage.setItem('ilab_admin_dashboard_set', 'true')
      } else if (isSolo) {
        await sb.from('solo_users').update({ active_modules: modules, has_set_dashboard: true }).eq('id', session.userId)
      } else {
        const { data: updated } = await sb.from('user_dashboard_prefs')
          .update({ active_modules: modules, has_set_dashboard: true })
          .eq('user_id', session.userId)
          .select('id')
        if (!updated?.length) {
          await sb.from('user_dashboard_prefs')
            .insert({ user_id: session.userId, active_modules: modules, has_set_dashboard: true })
        }
      }
      toast('Dashboard icons saved ✓')
    } catch (e) { toast('Error saving preferences.') }
    setActiveModules(modules)
    setSaving(false)
  }

  if (selected === null) return (
    <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  )

  if (session?.role === 'student' && allowedPool !== null && allowedPool.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>No icons assigned yet</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>Your lab manager hasn't assigned dashboard icons for you yet.</div>
    </div>
  )

  const baseDisplay = (() => {
    if (session?.role === 'student' && allowedPool?.length) {
      const studentPool = adminPool !== null
        ? allowedPool.filter(k => adminPool.includes(k))
        : allowedPool
      return available.filter(m => studentPool.includes(m.key) || PINNED_MODULES.includes(m.key))
    }
    if (adminPool !== null) return available.filter(m => adminPool.includes(m.key) || m.key === 'profile')
    return available
  })()

  const displayModules = displayOrder !== null
    ? displayOrder.map(k => baseDisplay.find(m => m.key === k)).filter(Boolean)
    : baseDisplay

  const selectedCount = selected.size

  function handleDragStart(e, key) {
    if (PINNED_MODULES.includes(key)) return
    dragKeyRef.current = key
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
    setDragKey(key)
  }
  function handleDragOver(e, key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key) }
  function handleDrop(e, targetKey) {
    e.preventDefault()
    const sourceKey = dragKeyRef.current
    if (!sourceKey || sourceKey === targetKey) { setDragKey(null); setDragOverKey(null); return }
    setDisplayOrder(order => {
      const from = order.indexOf(sourceKey)
      const to = order.indexOf(targetKey)
      if (from === -1 || to === -1) return order
      const next = [...order]
      next.splice(from, 1)
      next.splice(to, 0, sourceKey)
      return next
    })
    dragKeyRef.current = null
    setDragKey(null)
    setDragOverKey(null)
  }
  function handleDragEnd() { dragKeyRef.current = null; setDragKey(null); setDragOverKey(null) }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎛️ Dashboard Icons</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>Choose which shortcuts appear on your dashboard.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}><span style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedCount}</span> of {displayModules.length} selected</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setSelected(new Set(displayModules.map(m => m.key)))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>Select all</button>
          <button onClick={() => setSelected(new Set(PINNED_MODULES))} style={{ fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontWeight: 500 }}>Clear</button>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(selectedCount / displayModules.length) * 100}%`, background: loginMode === 'solo' ? '#534AB7' : 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        💡 Drag cards to reorder icons on your home screen
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10, marginBottom: 24 }}>
        {displayModules.map(m => {
          const pinned = PINNED_MODULES.includes(m.key)
          const locked = isSolo && !!m.soloLocked
          const sel = selected.has(m.key)
          const isDragging = dragKey === m.key
          const isOver = dragOverKey === m.key && dragKey !== m.key

          if (locked) return (
            <div key={m.key} style={{ borderRadius: 12, border: '2px solid var(--border)', background: 'var(--surface2)', padding: '14px 14px 12px', cursor: 'default', position: 'relative', opacity: 0.5, userSelect: 'none', filter: 'grayscale(0.6)' }}>
              <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, pointerEvents: 'none' }}>🔒</div>
              <div style={{ fontSize: 26, marginBottom: 7, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, paddingRight: 22, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text3)', fontWeight: 600, pointerEvents: 'none' }}>Team accounts only</div>
            </div>
          )

          return (
            <div key={m.key}
              draggable={!pinned}
              onDragStart={e => handleDragStart(e, m.key)}
              onDragOver={e => handleDragOver(e, m.key)}
              onDrop={e => handleDrop(e, m.key)}
              onDragEnd={handleDragEnd}
              onClick={() => !pinned && toggle(m.key)}
              style={{ borderRadius: 12, border: isOver ? `2px dashed ${loginMode === 'solo' ? '#534AB7' : 'var(--accent)'}` : sel ? `2px solid ${m.color}` : '2px solid var(--border)', background: sel ? `${m.color}12` : 'var(--surface)', padding: '14px 14px 12px', cursor: pinned ? 'default' : 'grab', position: 'relative', transition: 'opacity 0.15s', opacity: isDragging ? 0.35 : pinned ? 0.7 : 1, userSelect: 'none' }}>
              <div style={{ position: 'absolute', top: 9, right: 9, width: 20, height: 20, borderRadius: '50%', background: sel ? m.color : 'var(--surface2)', border: `2px solid ${sel ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <div style={{ fontSize: 26, marginBottom: 7, pointerEvents: 'none' }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: sel ? m.color : 'var(--text)', marginBottom: 2, paddingRight: 22, pointerEvents: 'none' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4, pointerEvents: 'none' }}>{m.sub}</div>
              {pinned && <div style={{ marginTop: 6, fontSize: 10, color: m.color, fontWeight: 600, pointerEvents: 'none' }}>Always visible</div>}
            </div>
          )
        })}
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !selected}>{saving ? 'Saving…' : 'Save dashboard icons'}</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ══════════════════════════════════════════════════════════════
function NotificationPrefsPanel({ userId, role }) {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useAppStore()

  const SECTIONS = [
    { title: '📅 Equipment Booking', desc: 'Notifications about your equipment reservations.', roles: ['student', 'user', 'admin', 'solo'], events: [
      { key: 'booking_confirmed', label: 'Booking confirmed' },
      { key: 'booking_reminder',  label: 'Upcoming booking reminder (1 day before)' },
      { key: 'booking_cancelled', label: 'Booking cancelled' },
    ]},
    { title: '🎓 Training & Certifications', desc: 'Stay on top of your training status.', roles: ['student'], events: [
      { key: 'training_approved',  label: 'Training certificate approved' },
      { key: 'training_expiring',  label: 'Training certificate expiring soon' },
      { key: 'training_submitted', label: 'Training submission received' },
    ]},
    { title: '📋 Project Management', desc: 'Notifications from the PM workspace.', roles: ['user', 'admin'], events: [
      { key: 'task_assigned',       label: 'Task assigned to me' },
      { key: 'task_comment',        label: 'New comment on my task' },
      { key: 'meeting_added',       label: 'New meeting task assigned to me' },
      { key: 'task_status_changed', label: 'Task status changed by someone else' },
      { key: 'deadline_reminder',   label: 'Task due tomorrow — advance reminder' },
    ]},
    { title: '📝 Daily Reminders', desc: 'Notifications from your personal reminder list.', roles: ['user', 'admin'], events: [
      { key: 'reminder_daily', label: 'Morning check — see today\'s reminder list (7–11 am)' },
      { key: 'reminder_items', label: 'Reminder item alerts — noon, afternoon & timed items' },
    ]},
    { title: '🤝 Project Team', desc: 'Notifications about project team invites.', roles: ['student', 'user', 'admin'], events: [
      { key: 'team_invite', label: 'Project team invite received or accepted' },
    ]},
    { title: '💬 Lab Messages', desc: 'Messages from the Contact Lab Manager feature.', roles: ['student', 'user', 'admin', 'solo'], events: [
      { key: 'message_reply', label: 'Reply received to my message' },
    ]},
  ].filter(s => s.roles.includes(role))

  useEffect(() => { if (userId) load() }, [userId])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
    const defaults = {}
    SECTIONS.forEach(sec => sec.events.forEach(ev => { defaults[ev.key] = true; defaults[`email_${ev.key}`] = false }))
    setPrefs(data ? { ...defaults, ...data } : defaults)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { error } = await sb.from('notification_prefs').upsert(
      { ...prefs, user_id: userId },
      { onConflict: 'user_id' }
    )
    if (error) {
      toast('Error saving preferences: ' + error.message)
      console.error('notification_prefs upsert error:', error)
    } else {
      toast('Notification preferences saved ✓')
    }
    setSaving(false)
  }

  if (!userId) return <div style={{ fontSize: 13, color: 'var(--text3)', padding: 16 }}>Sign in to manage notification preferences.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>Choose how you want to be notified. <strong>In-app</strong> shows a 🔔 inside iLab. <strong>Email</strong> sends to your registered address.</div>
      {SECTIONS.map(sec => (
        <div key={sec.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontWeight: 600, fontSize: 14 }}>{sec.title}</div><div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{sec.desc}</div></div>
            <div style={{ display: 'flex', gap: 24, fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              <span style={{ width: 50, textAlign: 'center' }}>In-app 🔔</span>
              <span style={{ width: 50, textAlign: 'center' }}>Email 📧</span>
            </div>
          </div>
          {sec.events.map((ev, i) => (
            <div key={ev.key} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: i < sec.events.length - 1 ? '1px solid var(--surface2)' : 'none' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{ev.label}</div>
              <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
                <div style={{ width: 50, textAlign: 'center' }}><input type="checkbox" checked={!!prefs[ev.key]} onChange={e => setPrefs(p => ({ ...p, [ev.key]: e.target.checked }))} style={{ width: 'auto', cursor: 'pointer', transform: 'scale(1.3)' }} /></div>
                <div style={{ width: 50, textAlign: 'center' }}><input type="checkbox" checked={!!prefs[`email_${ev.key}`]} onChange={e => setPrefs(p => ({ ...p, [`email_${ev.key}`]: e.target.checked }))} style={{ width: 'auto', cursor: 'pointer', transform: 'scale(1.3)' }} /></div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Email notifications require your email address to be set in your profile.</div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save notification preferences'}</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ADMIN PROFILE
// ══════════════════════════════════════════════════════════════
function OrgContactPanel({ session, toast }) {
  const [org, setOrg] = useState(null)
  const [form, setForm] = useState({ contact_name: '', contact_email: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    if (!session?.organizationId) { setLoading(false); return }
    const { data } = await sb.from('organizations').select('*').eq('id', session.organizationId).maybeSingle()
    setOrg(data)
    if (data) setForm({ contact_name: data.contact_name || '', contact_email: data.contact_email || '' })
    setLoading(false)
  }

  async function save() {
    if (!session?.organizationId) return
    setSaving(true)
    const { error } = await sb.from('organizations').update({
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim().toLowerCase() || null,
    }).eq('id', session.organizationId)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    toast('Contact info saved ✓')
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🏢 Organization Contact Info</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
        Set a contact name and email for your organization. Members who need help logging in will see this on the login page.
      </div>
      {org && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Organization: </span>
          <strong>{org.name}</strong>
        </div>
      )}
      <div className="field">
        <label>Contact person's name</label>
        <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="e.g. Dr. Smith" />
      </div>
      <div className="field">
        <label>Contact email address</label>
        <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="admin@yourlab.edu" />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>This email will appear on the login page when a member of your organization asks for help.</div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving || !form.contact_email.trim()}>
        {saving ? 'Saving…' : 'Save contact info'}
      </button>
    </div>
  )
}


function AdminProfile() {
  const { session, toast } = useAppStore()
  const isOrgAdmin = !!session?.userId   // false = super admin (userId null)
  const [adminTab, setAdminTab] = useState('admin')

  // Super admin: only show password change — no user/org data
  if (!isOrgAdmin) {
    return (
      <div>
        <div className="section-title" style={{ marginBottom: 24 }}>Profile</div>
        <AdminSettings session={session} toast={toast} />
      </div>
    )
  }

  const tabs = [
    { key: 'admin',    label: '🔑 Admin Settings' },
    { key: 'students', label: '👥 Lab Users' },
    { key: 'staff',    label: '👨‍💼 Lab Managers' },
    { key: 'icons',    label: '🖼️ Icon Images' },
    { key: 'dashboard',label: '🎛️ Dashboard Icons' },
    { key: 'notifs',   label: '🔔 Notifications' },
    { key: 'org',      label: '🏢 Organization' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setAdminTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: adminTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${adminTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>
      {adminTab === 'admin'     && <AdminSettings session={session} toast={toast} />}
      {adminTab === 'students'  && <StudentsPanel toast={toast} session={session} />}
      {adminTab === 'staff'     && <StaffPanel toast={toast} session={session} />}
      {adminTab === 'icons'     && <IconImageManager toast={toast} />}
      {adminTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {adminTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="admin" />}
      {adminTab === 'org'       && <OrgContactPanel session={session} toast={toast} />}
    </div>
  )
}

function AdminSettings({ session: sessionProp, toast }) {
  const { session: storeSession } = useAppStore()
  const session = sessionProp ?? storeSession
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function savePassword() {
    setError('')
    if (!form.currentPassword) { setError('Enter your current password.'); return }
    if (!form.newPassword) { setError('Enter a new password.'); return }
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.newPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    setSaving(true)
    const email = session?.email || (await sb.auth.getUser()).data?.user?.email
    if (!email) { setError('Cannot verify identity. Sign out and back in.'); setSaving(false); return }
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email, password: form.currentPassword })
    if (reAuthErr) { setError('Current password is incorrect.'); setSaving(false); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: form.newPassword })
    if (updateErr) { setError('Failed to update. Try again.'); setSaving(false); return }
    toast('Password updated ✓')
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setSaving(false)
  }
  return (
    <div className="card" style={{ maxWidth: 440 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔑 Account Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Update the admin password.</div>
      <div className="field"><label>Current password</label><input type="password" value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="••••••••" /></div>
      <div className="field"><label>New password</label><input type="password" value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min. 6 characters" /></div>
      <div className="field"><label>Confirm new password</label><input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" /></div>
      {error && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {error}</div>}
      <button className="btn btn-primary" onClick={savePassword} disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
    </div>
  )
}

// ── STUDENTS PANEL ── with 🎛️ icon button per student
function StudentsPanel({ toast, session }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [iconStudent, setIconStudent] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = sb.from('users').select('*').eq('role', 'student').order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStudents(data || [])
    setLoading(false)
  }

  const filtered = students.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return sFirstName(s).toLowerCase().includes(q) || sLastName(s).toLowerCase().includes(q) || sEmail(s).toLowerCase().includes(q)
  })

  async function saveStudent(form, id) {
    if (!form.firstName.trim() && !form.lastName.trim()) { toast('Name is required.'); return }
    const actualEmail = form.emailAddr?.trim().toLowerCase()
    if (!id) {
      if (!form.password) { toast('Password is required.'); return }
      if (!actualEmail) { toast('Email is required for student login.'); return }
    }
    if (!form.selectedProjectIds || form.selectedProjectIds.length === 0) { toast('Please assign at least one project.'); return }
    const payload = { name: form.lastName.trim(), email: form.firstName.trim() || null, phone: actualEmail || null, degree: form.supervisor || null, year_semester: form.year_semester || null, project_group: form.project_group || null, assigned_project_ids: form.selectedProjectIds || [], nickname: form.nickname || null, organization_id: session?.organizationId || null, role: 'student', is_active: true, admin_level: 0, pin: '', must_change_password: !id && !!form.password }
    if (!id && form.password && actualEmail) {
      try {
        const authUser = await createAuthUser(actualEmail, form.password)
        if (authUser) payload.auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }
    }
    if (id) {
      const { error } = await sb.from('users').update(payload).eq('id', id)
      if (error) { toast('Error: ' + error.message); return }
    } else {
      const { error } = await sb.from('users').insert(payload)
      if (error) { toast('Error: ' + error.message); return }
    }
    setShowModal(false); setEditStudent(null); load(); toast('Student saved ✓')
  }

  async function toggleActive(s) { await sb.from('users').update({ is_active: !s.is_active }).eq('id', s.id); load(); toast(s.is_active ? 'Deactivated.' : 'Activated.') }
  async function deleteStudent(id) { if (!confirm('Delete this student?')) return; await sb.from('users').delete().eq('id', id); load(); toast('Deleted.') }

  async function parseExcel(file) {
    const XLSX = await import('xlsx')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          const items = []
          for (let i = 1; i < rows.length; i++) {
            const [name, email, phone, degree, year_semester, supervisor, project_group] = rows[i]
            if (name?.trim()) items.push({ name: name.trim(), email: email||'', phone: phone||'', degree: degree||'', year_semester: year_semester||'', supervisor: supervisor||'', project_group: project_group||'' })
          }
          resolve(items)
        } catch(err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsBinaryString(file)
    })
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    let added = 0
    for (const s of importPreview) {
      const { error } = await sb.from('users').insert({ ...s, pin: '', role: 'student', is_active: true, admin_level: 0, must_change_password: true })
      if (!error) added++
    }
    setImportPreview(null); setImporting(false); load(); toast(`${added} students imported. Set their passwords individually to activate login.`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{students.length} lab user{students.length !== 1 ? 's' : ''}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>⬆️ Import Excel</button>
          <button className="btn btn-sm btn-primary" onClick={() => { setEditStudent(null); setShowModal(true) }}>+ Add lab user</button>
        </div>
      </div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
        {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)' }}>×</button>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={async e => { try { setImportPreview(await parseExcel(e.target.files[0])) } catch { toast('Error reading file.') } }} />
      {importPreview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Import preview — {importPreview.length} students</div>
          {importPreview.slice(0,3).map((s,i) => <div key={i} style={{ fontSize: 13, padding: '2px 0', color: 'var(--text2)' }}>· {s.name}</div>)}
          {importPreview.length > 3 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>…and {importPreview.length - 3} more</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={confirmImport} disabled={importing}>{importing ? 'Importing…' : 'Import now'}</button>
            <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">👥</div>{search ? 'No lab users match your search.' : 'No lab users yet.'}</div>
        : filtered.map((s, idx) => (
          <div key={s.id} className="card" style={{ padding: '12px 18px', marginBottom: 10, opacity: s.is_active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 6 }}>#{idx+1}</span>
                  {sLastName(s)}{sLastName(s) && sFirstName(s) ? ', ' : ''}{sFirstName(s)}
                  {!s.is_active && <span style={{ fontSize: 11, color: 'var(--accent2)', marginLeft: 6 }}>Inactive</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
                  {sEmail(s) && <span>📧 {sEmail(s)}</span>}
                  {s.password && <span style={{ fontSize: 11, color: 'var(--text3)' }}>🔑 ••••••••</span>}
                  {s.project_group && <span>{s.project_group}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={() => setIconStudent(s)} title="Set allowed dashboard icons">🎛️ Icons</button>
                <button className="btn btn-sm" onClick={() => { setEditStudent(s); setShowModal(true) }}>Edit</button>
                <button className="btn btn-sm" onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteStudent(s.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))
      }
      {showModal && <StudentModal student={editStudent} session={session} onClose={() => { setShowModal(false); setEditStudent(null) }} onSave={saveStudent} />}
      {iconStudent && <StudentIconManager student={iconStudent} onClose={(saved) => { setIconStudent(null); if (saved) toast(`Icons updated for ${iconStudent.email || iconStudent.name} ✓`) }} />}
    </div>
  )
}

function StudentModal({ student, session, onClose, onSave }) {
  const [form, setForm] = useState(student ? {
    firstName: sFirstName(student), lastName: sLastName(student), emailAddr: sEmail(student), supervisor: sSupervisor(student),
    password: '', year_semester: student.year_semester||'', project_group: student.project_group||'',
    selectedProjectIds: student.assigned_project_ids || [],
    nickname: student.nickname || '',
  } : { firstName: '', lastName: '', emailAddr: '', supervisor: '', password: '', year_semester: '', project_group: '', selectedProjectIds: [], nickname: '' })
  const [orgProjects, setOrgProjects] = useState([])

  useEffect(() => {
    if (!session?.organizationId) return
    sb.from('projects').select('id, name, project_id')
      .eq('organization_id', session.organizationId)
      .is('solo_owner_id', null)
      .order('name')
      .then(({ data }) => setOrgProjects(data || []))
  }, [session?.organizationId])

  function toggleProject(id) {
    setForm(f => ({
      ...f,
      selectedProjectIds: f.selectedProjectIds.includes(id)
        ? f.selectedProjectIds.filter(x => x !== id)
        : [...f.selectedProjectIds, id],
    }))
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)' }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{student ? 'Edit lab user' : 'Add lab user'}</div>
        <div className="grid-2">
          <div className="field"><label>First Name *</label><input value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="e.g. Ivan" autoFocus /></div>
          <div className="field"><label>Last Name *</label><input value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="e.g. Akonya" /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Nickname <span style={{ fontWeight:400, color:'var(--text3)' }}>(optional)</span></label><input value={form.nickname} onChange={e=>setForm(f=>({...f,nickname:e.target.value}))} placeholder="e.g. Alex" /></div>
          <div className="field"><label>Email Address</label><input type="email" value={form.emailAddr} onChange={e=>setForm(f=>({...f,emailAddr:e.target.value}))} placeholder="netid@illinois.edu" /></div>
        </div>
        <div className="field">
          <label>Password{student ? ' (leave blank to keep current)' : ' *'}</label>
          <input type="text" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={student ? 'Leave blank to keep unchanged' : 'Min. 6 chars'} />
        </div>
        <div className="grid-2">
          <div className="field"><label>Supervisor</label><input value={form.supervisor} onChange={e=>setForm(f=>({...f,supervisor:e.target.value}))} placeholder="e.g. Prof. Imad Al-Qadi" /></div>
          <div className="field"><label>Project Group</label>
            <select value={form.project_group} onChange={e=>setForm(f=>({...f,project_group:e.target.value}))}>
              <option value="">— Select —</option>{PROJECT_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        {orgProjects.length > 0 && (
          <div className="field">
            <label>Assigned Projects *</label>
            <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'8px 12px', maxHeight:180, overflowY:'auto' }}>
              {orgProjects.map(p => (
                <div key={p.id} onClick={() => toggleProject(p.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', userSelect:'none', padding:'4px 0' }}>
                  <input type="checkbox" readOnly checked={form.selectedProjectIds.includes(p.id)} style={{ width:'auto', flexShrink:0, cursor:'pointer' }} />
                  <span style={{ lineHeight:1.3 }}>{p.project_id ? `${p.project_id} – ${p.name}` : p.name}</span>
                </div>
              ))}
            </div>
            {form.selectedProjectIds.length > 0 && (
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{form.selectedProjectIds.length} project{form.selectedProjectIds.length !== 1 ? 's' : ''} selected</div>
            )}
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-primary" onClick={()=>onSave(form, student?.id)}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function StaffPanel({ toast, session }) {
  const [staffTab, setStaffTab] = useState('list')
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[{ key: 'list', label: '👨‍💼 Lab Managers' }, { key: 'access', label: '🗂️ Access Control' }].map(t => (
          <button key={t.key} onClick={() => setStaffTab(t.key)}
            style={{ padding: '8px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: staffTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${staffTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {staffTab === 'list'   && <StaffListPanel toast={toast} session={session} />}
      {staffTab === 'access' && <AccessControl toast={toast} session={session} />}
    </div>
  )
}

function StaffListPanel({ toast, session }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  useEffect(() => { load() }, [])
  async function load() { setLoading(true); let q = sb.from('users').select('*').in('role', ['user', 'admin']).order('name'); if (session?.organizationId) q = q.eq('organization_id', session.organizationId); const { data } = await q; setStaff(data || []); setLoading(false) }
  async function saveStaff(form, id) {
    if (!form.name.trim()) { toast('Name is required.'); return }
    const actualEmail = form.email?.trim().toLowerCase()
    if (!id) {
      if (!form.password) { toast('Password is required.'); return }
      if (!actualEmail) { toast('Email is required for staff login.'); return }
    }
    const payload = { name: form.name.trim(), email: actualEmail || null, phone: form.phone || null, role: 'user', is_active: true, admin_level: 0, pin: '', organization_id: session?.organizationId || null, must_change_password: !id && !!form.password }
    if (!id && form.password && actualEmail) {
      try {
        const authUser = await createAuthUser(actualEmail, form.password)
        if (authUser) payload.auth_id = authUser.id
      } catch (err) { toast('Error creating login account: ' + (err.message || 'Try again.')); return }
    }
    if (id) { const { error } = await sb.from('users').update(payload).eq('id', id); if (error) { toast('Error: ' + error.message); return } }
    else { const { error } = await sb.from('users').insert(payload); if (error) { toast('Error: ' + error.message); return } }
    setShowModal(false); setEditStaff(null); load(); toast('Staff saved ✓')
  }
  async function toggleActive(s) { await sb.from('users').update({ is_active: !s.is_active }).eq('id', s.id); load(); toast(s.is_active ? 'Deactivated.' : 'Activated.') }
  async function deleteStaff(id) { if (!confirm('Delete this staff member?')) return; await sb.from('users').delete().eq('id', id); load(); toast('Deleted.') }
  async function setMemberRole(u, newRole) { await sb.from('users').update({ role: newRole, admin_level: 0 }).eq('id', u.id); toast(`${u.name} updated to ${newRole === 'user' ? 'Staff' : 'Student'} ✓`); load() }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{staff.length} lab manager{staff.length !== 1 ? 's' : ''} &amp; org admin{staff.filter(s=>s.role==='admin').length !== 1 ? 's' : ''}</div>
        <button className="btn btn-sm btn-primary" onClick={() => { setEditStaff(null); setShowModal(true) }}>+ Add lab manager</button>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : staff.length === 0 ? <div className="empty-state"><div className="empty-icon">👨‍💼</div>No lab managers yet.</div>
        : staff.map((s, idx) => (
          <div key={s.id} className="card" style={{ padding: '12px 18px', marginBottom: 10, opacity: s.is_active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 6 }}>#{idx+1}</span>
                  {s.name}<span style={{ marginLeft: 8, fontSize: 11, background: s.role === 'admin' ? '#fce8ff' : '#fff3e0', color: s.role === 'admin' ? '#7e22ce' : '#ff6b00', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>{s.role === 'admin' ? 'Org Admin' : 'Lab Manager'}</span>
                  {!s.is_active && <span style={{ fontSize: 11, color: 'var(--accent2)', marginLeft: 6 }}>Inactive</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                  {s.email && <span>📧 {s.email}</span>}
                  {s.password && <span style={{ fontSize: 11, color: 'var(--text3)' }}>🔑 ••••••••</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={() => { setEditStaff(s); setShowModal(true) }}>Edit</button>
                <button className="btn btn-sm" onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteStaff(s.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))
      }
      {showModal && <StaffModal staff={editStaff} onClose={() => { setShowModal(false); setEditStaff(null) }} onSave={saveStaff} onRoleChange={setMemberRole} />}
    </div>
  )
}

function StaffModal({ staff, onClose, onSave, onRoleChange }) {
  const [form, setForm] = useState(staff ? { name: staff.name||'', password: '', email: staff.email||'', phone: staff.phone||'' } : { name: '', password: '', email: '', phone: '' })
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)

  function handleRoleClick(opt) {
    if (opt.role === staff.role) return
    if (opt.role === 'student') { setConfirmDowngrade(true); return }
    onRoleChange(staff, opt.role); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:480, width:'100%', border:'1px solid var(--border)' }}>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{staff ? 'Edit lab manager' : 'Add lab manager'}</div>
        <div className="grid-2">
          <div className="field"><label>Full Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoFocus /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="netid@illinois.edu" /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Password{staff ? ' (leave blank to keep)' : ' *'}</label><input type="text" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={staff ? 'Type to change' : 'Min. 6 chars'} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
        </div>
        {staff && onRoleChange && (
          <div className="field">
            <label>Role</label>
            <div style={{ display:'flex', gap:8 }}>
              {[{ label: 'Lab Manager', role: 'user' }, { label: 'Lab User', role: 'student' }].map(opt => (
                <button key={opt.role}
                  className={`btn btn-sm${staff.role === opt.role ? ' btn-primary' : ''}`}
                  onClick={() => handleRoleClick(opt)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {confirmDowngrade && (
          <div style={{ background:'#fff8f0', border:'1.5px solid #f59e0b', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:12 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:6, color:'#92400e' }}>⚠️ Change role to Lab User?</div>
            <div style={{ fontSize:13, color:'#78350f', lineHeight:1.6, marginBottom:12 }}>
              By changing the role, this user will become a lab user and will be listed under the Lab Users tab. All lab manager access will be removed. Do you still want to change the role?
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-sm btn-primary" style={{ background:'#d97706', borderColor:'#d97706' }}
                onClick={() => { onRoleChange(staff, 'student'); onClose() }}>Yes, change role</button>
              <button className="btn btn-sm" onClick={() => setConfirmDowngrade(false)}>No, keep as Lab Manager</button>
            </div>
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-primary" onClick={()=>onSave(form, staff?.id)}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function SupervisorSelect({ value, onChange }) {
  const { session } = useAppStore()
  const [supervisors, setSupervisors] = useState([])
  useEffect(() => {
    let q = sb.from('users').select('id, name').eq('role', 'user').eq('is_active', true).order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    q.then(({ data }) => setSupervisors(data || []))
  }, [session?.organizationId])
  return (
    <select value={value||''} onChange={e => onChange(e.target.value)}>
      <option value="">— Select supervisor —</option>
      {supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
    </select>
  )
}

// ══════════════════════════════════════════════════════════════
// STAFF: MANAGE STUDENT DASHBOARD ICONS
// ══════════════════════════════════════════════════════════════
function StaffStudentIconManager() {
  const { toast, session } = useAppStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [iconStudent, setIconStudent] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = sb.from('users').select('*').eq('role', 'student').order('name')
    if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStudents(data || [])
    setLoading(false)
  }

  const filtered = students.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return sFirstName(s).toLowerCase().includes(q) || sLastName(s).toLowerCase().includes(q) || sEmail(s).toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎛️ Student Dashboard Icons</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Select a student to choose which icons they are allowed to see and pick from on their dashboard.
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
        {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)' }}>×</button>}
      </div>

      {loading
        ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0
          ? <div className="empty-state"><div className="empty-icon">👥</div>{search ? 'No students match your search.' : 'No students yet.'}</div>
          : filtered.map((s, idx) => (
            <div key={s.id} className="card" style={{ padding: '12px 18px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 6 }}>#{idx + 1}</span>
                    {sLastName(s)}{sLastName(s) && sFirstName(s) ? ', ' : ''}{sFirstName(s)}
                  </div>
                  {sEmail(s) && <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>📧 {sEmail(s)}</div>}
                </div>
                <button className="btn btn-sm" onClick={() => setIconStudent(s)}>🎛️ Assign Icons</button>
              </div>
            </div>
          ))
      }

      {iconStudent && (
        <StudentIconManager
          student={iconStudent}
          onClose={(saved) => {
            setIconStudent(null)
            if (saved) toast(`Icons updated for ${sFirstName(iconStudent) || iconStudent.name} ✓`)
          }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STAFF PROFILE
// ══════════════════════════════════════════════════════════════
function StaffProfile({ session }) {
  const { toast, pendingProfileTab, setPendingProfileTab } = useAppStore()
  const [activeTab, setActiveTab] = useState('info')

  useEffect(() => {
    if (pendingProfileTab) {
      setActiveTab(pendingProfileTab)
      setPendingProfileTab(null)
    }
  }, [pendingProfileTab])
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {[
          { key: 'info',      label: '👤 My Profile' },
          { key: 'students',  label: '👥 Lab Users' },
          { key: 'staff',     label: '👨‍💼 Lab Managers' },
          { key: 'dashboard', label: '🎛️ Dashboard Icons' },
          { key: 'notifs',    label: '🔔 Notifications' },
          { key: 'team',      label: '🤝 Project Team' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'info'      && <UserProfileForm session={session} toast={toast} />}
      {activeTab === 'students'  && <StudentsPanel toast={toast} session={session} />}
      {activeTab === 'staff'     && <StaffListPanel toast={toast} session={session} />}
      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {activeTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="user" />}
      {activeTab === 'team'      && <TeamMembersPanel session={session} />}
    </div>
  )
}

function UserProfileForm({ session, toast }) {
  const { setSession } = useAppStore()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [form, setForm] = useState({})
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' })
  const [pinError, setPinError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let u = null
    if (session.userId) { const { data } = await sb.from('users').select('*').eq('id', session.userId).maybeSingle(); u = data }
    if (!u) { const { data } = await sb.from('users').select('*').eq('name', session.username).maybeSingle(); u = data }
    setUser(u)
    if (u) setForm({ name: u.name||'', last_name: u.last_name||'', email: u.email||'', phone: u.phone||'', degree: u.degree||'', year_semester: u.year_semester||'', supervisor: u.supervisor||'', project_group: u.project_group||'', photo_url: u.photo_url||'' })
    setLoading(false)
  }

  const isStudent = session?.role === 'student'

  async function saveInfo() {
    setSaving(true)
    const payload = { name: form.name.trim(), last_name: form.last_name||null, phone: form.phone||null, degree: form.degree||null, year_semester: form.year_semester||null, photo_url: form.photo_url||null }
    if (!isStudent) { payload.supervisor = form.supervisor||null; payload.project_group = form.project_group||null }
    const { error } = await sb.from('users').update(payload).eq('id', user.id)
    if (error) { toast('Error saving: ' + error.message); setSaving(false); return }
    setSession({ ...session, username: form.name.trim(), photoUrl: form.photo_url||null })
    toast('Profile saved ✓'); setSaving(false); load()
  }

  async function savePin() {
    setPinError('')
    if (!pinForm.current) { setPinError('Enter your current password.'); return }
    if (!pinForm.newPin || pinForm.newPin.length < 6) { setPinError('New password must be at least 6 characters.'); return }
    if (pinForm.newPin !== pinForm.confirm) { setPinError('Passwords do not match.'); return }
    const { error: reAuthErr } = await sb.auth.signInWithPassword({ email: session.email, password: pinForm.current })
    if (reAuthErr) { setPinError('Current password is incorrect.'); return }
    const { error: updateErr } = await sb.auth.updateUser({ password: pinForm.newPin })
    if (updateErr) { setPinError('Failed to update. Try again.'); return }
    toast('Password updated ✓'); setPinForm({ current: '', newPin: '', confirm: '' })
  }

  async function uploadPhoto(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(), url = URL.createObjectURL(file)
        img.onload = () => {
          const s = Math.min(1, 400 / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `avatars/${user.id}_${Date.now()}.jpg`
      const { error: uploadErr } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw uploadErr
      const photoUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      await sb.from('users').update({ photo_url: photoUrl }).eq('id', user.id)
      setForm(f => ({ ...f, photo_url: photoUrl }))
      setUser(u => ({ ...u, photo_url: photoUrl }))
      setSession({ ...session, photoUrl })
      toast('Photo saved ✓')
    } catch (err) { toast('Upload failed: ' + (err?.message || String(err))) }
    setUploading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!user) return <div className="empty-state"><div className="empty-icon">👤</div>Profile not found.</div>

  const displayName = [user.name, user.last_name].filter(Boolean).join(' ')
  const previewPhoto = form.photo_url || user.photo_url

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {previewPhoto ? <img src={previewPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{displayName || user.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ background: 'var(--surface2)', borderRadius: 99, padding: '3px 12px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{user.role === 'student' ? 'Student' : 'Staff'}</span>
            {user.project_group && <span style={{ background: groupBg[user.project_group]||'#f0efe9', color: groupColor[user.project_group]||'#6b6860', borderRadius: 99, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>{user.project_group}</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[{ key: 'info', label: '👤 Info' }, { key: 'avatar', label: '🖼️ Photo' }, { key: 'pin', label: '🔑 Password' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'info' && (
        <div className="card">
          <div className="grid-2">
            <div className="field"><label>First Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label>Last Name</label><input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Email</label>
              <input value={form.email} readOnly placeholder="—" style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Email is managed by your organization admin.</div>
            </div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Degree</label>
              <select value={form.degree} onChange={e => setForm(f => ({ ...f, degree: e.target.value }))}>
                <option value="">— Select —</option>{DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field"><label>Semester & Year Started</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={(form.year_semester||'').split(' ')[0]||''} onChange={e => { const yr = (form.year_semester||'').split(' ')[1]||''; setForm(f => ({ ...f, year_semester: `${e.target.value} ${yr}`.trim() })) }} style={{ flex: 1 }}>
                  <option value="">Sem</option>{SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={(form.year_semester||'').split(' ')[1]||''} onChange={e => { const sem = (form.year_semester||'').split(' ')[0]||''; setForm(f => ({ ...f, year_semester: `${sem} ${e.target.value}`.trim() })) }} style={{ flex: 1 }}>
                  <option value="">Year</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Supervisor</label>
              {isStudent
                ? <input value={form.supervisor || '—'} readOnly style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
                : <SupervisorSelect value={form.supervisor} onChange={v => setForm(f => ({ ...f, supervisor: v }))} />}
            </div>
            <div className="field"><label>Project Group</label>
              {isStudent
                ? <input value={form.project_group || '—'} readOnly style={{ background: 'var(--surface2)', color: 'var(--text3)', cursor: 'default' }} />
                : <select value={form.project_group} onChange={e => setForm(f => ({ ...f, project_group: e.target.value }))}>
                    <option value="">— Select —</option>{PROJECT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>}
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveInfo} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}
      {activeTab === 'avatar' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {form.photo_url ? <img src={form.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32, color: 'var(--text3)' }}>👤</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Current photo</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Photo saves automatically after upload.</div>
            </div>
            {form.photo_url && (
              <button className="btn btn-sm" onClick={async () => {
                await sb.from('users').update({ photo_url: null }).eq('id', user.id)
                setForm(f => ({ ...f, photo_url: '' })); setUser(u => ({ ...u, photo_url: null })); setSession({ ...session, photoUrl: null }); toast('Photo removed.')
              }}>Remove</button>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Upload a photo</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Saves automatically.</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
            <button className="btn btn-sm btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳ Uploading…' : '⬆️ Choose photo'}</button>
          </div>
        </div>
      )}
      {activeTab === 'pin' && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Minimum 6 characters.</div>
          <div className="field"><label>Current password</label><input type="password" value={pinForm.current} onChange={e => { setPinForm(f => ({ ...f, current: e.target.value })); setPinError('') }} /></div>
          <div className="grid-2">
            <div className="field"><label>New password</label><input type="password" value={pinForm.newPin} onChange={e => { setPinForm(f => ({ ...f, newPin: e.target.value })); setPinError('') }} /></div>
            <div className="field"><label>Confirm</label><input type="password" value={pinForm.confirm} onChange={e => { setPinForm(f => ({ ...f, confirm: e.target.value })); setPinError('') }} /></div>
          </div>
          {pinError && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 12 }}>⚠️ {pinError}</div>}
          <button className="btn btn-primary" onClick={savePin} disabled={!pinForm.current || !pinForm.newPin || !pinForm.confirm}>Update password</button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// STUDENT PROFILE
// ══════════════════════════════════════════════════════════════
function UserProfile({ session }) {
  const { toast, pendingProfileTab, setPendingProfileTab } = useAppStore()
  const [activeTab, setActiveTab] = useState('info')

  useEffect(() => {
    if (pendingProfileTab) {
      setActiveTab(pendingProfileTab)
      setPendingProfileTab(null)
    }
  }, [pendingProfileTab])
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">My Profile</div>
        <HelpPanel screen="profile" />
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
        {[
          { key: 'info',      label: '👤 My Info' },
          { key: 'dashboard', label: '🎛️ Dashboard Icons' },
          { key: 'notifs',    label: '🔔 Notifications' },
          { key: 'team',      label: '🤝 Project Team' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: activeTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'info'      && <UserProfileForm session={session} toast={toast} />}
      {activeTab === 'dashboard' && <DashboardIconsPanel session={session} />}
      {activeTab === 'notifs'    && <NotificationPrefsPanel userId={session?.userId} role="student" />}
      {activeTab === 'team'      && <TeamMembersPanel session={session} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT — routes by role
// ══════════════════════════════════════════════════════════════
export default function Profile() {
  const { session } = useAppStore()
  if (session?.role === 'admin') return <AdminProfile />
  if (session?.role === 'user') return <StaffProfile session={session} />
  if (session?.loginMode === 'solo') return <SoloProfile session={session} />
  return <UserProfile session={session} />
}

function AccessControl({ toast, session }) {
  const ALL_SCREENS = [
    { key: 'home',        label: 'Supply Inventory',    icon: '📦' },
    { key: 'projects',    label: 'Project & Material',   icon: '🧪' },
    { key: 'training',    label: 'Training Records',    icon: '🎓' },
    { key: 'equipment',   label: 'Equipment Inventory', icon: '🔧' },
    { key: 'equipmenthub',label: 'Equipment Hub',       icon: '📚' },
    { key: 'booking',     label: 'Booking Equipment',   icon: '📅' },
    { key: 'remessages',  label: 'Contact Lab Manager', icon: '💬' },
    { key: 'mileage',     label: 'Mileage Form',        icon: '🚗' },
    { key: 'labsafety',   label: 'Lab Safety',          icon: '🦺' },
    { key: 'pm',          label: 'Project Management',  icon: '📋' },
    { key: 'barcode',     label: 'Barcode Scanner',     icon: '📷' },
    { key: 'profile',     label: 'Profile',             icon: '👤' },
    { key: 'barcodeqr',  label: 'Barcode/QR Scan',     icon: '🔲' },
  ]
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [access, setAccess] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (selected) loadAccess(selected.id) }, [selected])
  async function loadUsers() { setLoading(true); let q = sb.from('users').select('id, name, role').eq('role', 'user').eq('is_active', true).order('name'); if (session?.organizationId) q = q.eq('organization_id', session.organizationId); const { data } = await q; setUsers(data || []); setLoading(false) }
  async function loadAccess(userId) {
    const { data } = await sb.from('user_screen_access').select('screen_key').eq('user_id', userId)
    const map = {}
    if (data?.length) { data.forEach(r => { map[r.screen_key] = true }) } else { ALL_SCREENS.forEach(s => { map[s.key] = true }) }
    setAccess(map)
  }
  async function saveAccess() {
    if (!selected) return
    setSaving(true)
    await sb.from('user_screen_access').delete().eq('user_id', selected.id)
    const rows = Object.entries(access).filter(([, v]) => v).map(([key]) => ({ user_id: selected.id, screen_key: key }))
    if (rows.length) await sb.from('user_screen_access').insert(rows)
    toast('Access updated ✓'); setSaving(false)
  }
  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🗂️ Module Access per Lab Manager</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Control which modules each lab manager can see on their dashboard.</div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Select lab manager</label>
        <select value={selected?.id || ''} onChange={e => setSelected(users.find(u => u.id === e.target.value) || null)}>
          <option value="">— Select —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} (Staff)</option>)}
        </select>
      </div>
      {selected && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            {ALL_SCREENS.map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${access[s.key] ? 'var(--accent)' : 'var(--border)'}`, background: access[s.key] ? 'var(--accent-light)' : 'var(--surface2)', cursor: 'pointer', marginBottom: 0 }}>
                <input type="checkbox" checked={!!access[s.key]} onChange={e => setAccess(a => ({ ...a, [s.key]: e.target.checked }))} style={{ width: 'auto' }} />
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: access[s.key] ? 'var(--accent)' : 'var(--text)' }}>{s.label}</span>
              </label>
            ))}
          </div>
          <button className="btn btn-primary" onClick={saveAccess} disabled={saving}>{saving ? 'Saving…' : `Save access for ${selected.name}`}</button>
        </>
      )}
    </div>
  )
}

function IconImageManager({ toast }) {
  const ALL_MODULES = [
    { key: 'supply',      label: 'Supply Inventory',   icon: '📦', bg: '#e8f2ee' },
    { key: 'projects',    label: 'Project & Material',  icon: '🧪', bg: '#f3eeff' },
    { key: 'training',    label: 'Training Records',   icon: '🎓', bg: '#e0f2fe' },
    { key: 'equipment',   label: 'Equipment Inventory',icon: '🔧', bg: '#fef3c7' },
    { key: 'equipmenthub',label: 'Equipment',          icon: '📚', bg: '#e8f2ee' },
    { key: 'booking',     label: 'Booking Equipment',  icon: '📅', bg: '#e0f2fe' },
    { key: 'mileage',     label: 'Mileage Form',       icon: '🚗', bg: '#fdf0ed' },
    { key: 'labsafety',   label: 'Lab Safety',         icon: '🦺', bg: '#fef3c7' },
    { key: 'remessages',  label: 'Contact Lab Manager',icon: '💬', bg: '#e8f2ee' },
    { key: 'profile',     label: 'Profile',            icon: '👤', bg: '#f3eeff' },
    { key: 'pm',          label: 'Project Management', icon: '📋', bg: '#fff3e0' },
    { key: 'barcode',     label: 'Barcode Scanner',    icon: '📷', bg: '#e0f7fa' },
  ]
  const [images, setImages] = useState({})
  const [uploading, setUploading] = useState(null)
  const fileRefs = useRef({})
  useEffect(() => { loadImages() }, [])
  async function loadImages() {
    const keys = ALL_MODULES.map(m => `img_${m.key}`)
    const { data } = await sb.from('settings').select('key, value').in('key', keys)
    const map = {}; (data || []).forEach(r => { map[r.key.replace('img_', '')] = r.value }); setImages(map)
  }
  async function uploadImage(moduleKey, file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image file.'); return }
    setUploading(moduleKey)
    try {
      const compressed = await new Promise(resolve => {
        const img = new Image(); const url = URL.createObjectURL(file)
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
          URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
        }
        img.src = url
      })
      const path = `module-icons/${moduleKey}_${Date.now()}.jpg`
      const { error } = await sb.storage.from('project-files').upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
      if (error) throw error
      const publicUrl = sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
      await sb.from('settings').upsert({ key: `img_${moduleKey}`, value: publicUrl })
      setImages(prev => ({ ...prev, [moduleKey]: publicUrl }))
      toast(`Image updated for ${ALL_MODULES.find(m => m.key === moduleKey)?.label} ✓`)
    } catch { toast('Upload failed.') }
    setUploading(null)
  }
  async function removeImage(moduleKey) {
    await sb.from('settings').delete().eq('key', `img_${moduleKey}`)
    setImages(prev => { const n = { ...prev }; delete n[moduleKey]; return n }); toast('Image removed.')
  }
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🖼️ Dashboard Icon Images</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4, lineHeight: 1.6 }}>Upload a background photo for each dashboard card.</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Recommended: 800×500px or wider. JPG, PNG, or WebP.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {ALL_MODULES.map(m => {
          const img = images[m.key]
          return (
            <div key={m.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ height: 130, position: 'relative', background: m.bg, cursor: 'pointer' }} onClick={() => fileRefs.current[m.key]?.click()}>
                {img && <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div style={{ position: 'absolute', inset: 0, background: img ? 'linear-gradient(to top, rgba(0,0,0,0.65) 35%, transparent 100%)' : 'transparent' }} />
                {!img && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.5 }}>{m.icon}</div>}
                {img && <div style={{ position: 'absolute', bottom: 8, left: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{m.label}</div></div>}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0)'}>
                  <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 500, color: '#1a1916', pointerEvents: 'none' }}>
                    {uploading === m.key ? '⏳ Uploading…' : '📷 Click to upload'}
                  </div>
                </div>
                <input ref={el => fileRefs.current[m.key] = el} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadImage(m.key, e.target.files[0]) }} />
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.icon} {m.label}</div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => fileRefs.current[m.key]?.click()} disabled={uploading === m.key}>{uploading === m.key ? '⏳' : img ? 'Change' : 'Upload'}</button>
                  {img && <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => removeImage(m.key)}>x</button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
