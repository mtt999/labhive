import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

export default function FloorPlanEditor() {
  const { session, toast } = useAppStore()
  const orgId = session?.organizationId

  const [plans, setPlans]             = useState([])
  const [activePlanId, setActivePlanId] = useState(null)
  const [planName, setPlanName]       = useState('')
  const [imageUrl, setImageUrl]       = useState('')
  const [zones, setZones]             = useState([])
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)

  // Drawing state
  const [drawStart, setDrawStart]     = useState(null)
  const [draft, setDraft]             = useState(null)
  const [pendingZone, setPendingZone] = useState(null)
  const [pendingLabel, setPendingLabel] = useState('')

  const containerRef = useRef()

  useEffect(() => { loadPlans() }, [])

  async function loadPlans() {
    const { data } = await sb.from('floor_plans').select('*').eq('organization_id', orgId).order('created_at')
    setPlans(data || [])
    if (data?.length > 0 && !activePlanId) openPlan(data[0])
  }

  function openPlan(plan) {
    setActivePlanId(plan.id)
    setPlanName(plan.name || '')
    setImageUrl(plan.image_url || '')
    setZones(plan.zones || [])
    setDraft(null)
    setPendingZone(null)
    setPendingLabel('')
  }

  function newPlan() {
    setActivePlanId(null)
    setPlanName('')
    setImageUrl('')
    setZones([])
    setDraft(null)
    setPendingZone(null)
    setPendingLabel('')
  }

  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
  const MAX_FLOOR_PLAN_SIZE = 10 * 1024 * 1024

  async function uploadImage(file) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast('Only PNG, JPEG, and WebP images are allowed.')
      return
    }
    if (file.size > MAX_FLOOR_PLAN_SIZE) {
      toast('Image must be under 10 MB.')
      return
    }
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `floorplans/${orgId}/${Date.now()}_${safeName}`
      const { error } = await sb.storage.from('project-files').upload(path, file, { contentType: file.type, upsert: true })
      if (error) throw new Error(error.message)
      const { data } = sb.storage.from('project-files').getPublicUrl(path)
      setImageUrl(data.publicUrl)
    } catch (e) {
      toast('Upload failed: ' + e.message)
    }
    setUploading(false)
  }

  // ── Zone drawing ──────────────────────────────────────────────
  function getRelPos(e) {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function onMouseDown(e) {
    if (pendingZone) return
    e.preventDefault()
    const pos = getRelPos(e)
    setDrawStart(pos)
    setDraft({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  function onMouseMove(e) {
    if (!drawStart) return
    const pos = getRelPos(e)
    setDraft({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    })
  }

  function onMouseUp(e) {
    if (!drawStart) return
    const pos = getRelPos(e)
    const rect = {
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    }
    setDrawStart(null)
    setDraft(null)
    if (rect.w < 2 || rect.h < 2) return
    setPendingZone(rect)
    setPendingLabel('')
  }

  function confirmZone() {
    if (!pendingLabel.trim()) return
    setZones(z => [...z, { id: `zone_${Date.now()}`, label: pendingLabel.trim(), ...pendingZone }])
    setPendingZone(null)
    setPendingLabel('')
  }

  function cancelPending() {
    setPendingZone(null)
    setPendingLabel('')
  }

  function deleteZone(id) {
    setZones(z => z.filter(z2 => z2.id !== id))
  }

  // ── Save ──────────────────────────────────────────────────────
  async function save() {
    if (!planName.trim()) { toast('Enter a name for this floor plan.'); return }
    if (!imageUrl) { toast('Upload a floor plan image first.'); return }
    setSaving(true)
    try {
      const payload = {
        organization_id: orgId,
        name: planName.trim(),
        image_url: imageUrl,
        zones,
        updated_at: new Date().toISOString(),
      }
      if (activePlanId) {
        await sb.from('floor_plans').update(payload).eq('id', activePlanId)
      } else {
        const { data, error } = await sb.from('floor_plans').insert(payload).select().single()
        if (error) throw new Error(error.message)
        setActivePlanId(data.id)
      }
      toast('Floor plan saved.')
      loadPlans()
    } catch (e) {
      toast('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  async function deletePlan() {
    if (!activePlanId) return
    if (!window.confirm('Delete this floor plan? This cannot be undone.')) return
    await sb.from('floor_plans').delete().eq('id', activePlanId)
    newPlan()
    loadPlans()
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Floor Plans</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 20 }}>
        Upload your building floor plan image, then <strong>click and drag</strong> to draw named zones. Users will tap a zone to assign their material storage location.
      </div>

      {/* Plan selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {plans.map(p => (
          <button key={p.id} onClick={() => openPlan(p)}
            style={{ padding: '6px 16px', borderRadius: 99, border: `1.5px solid ${activePlanId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: activePlanId === p.id ? 'var(--accent-light)' : 'var(--surface)', color: activePlanId === p.id ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {p.name}
          </button>
        ))}
        <button onClick={newPlan}
          style={{ padding: '6px 16px', borderRadius: 99, border: '1.5px dashed var(--border)', background: 'var(--surface)', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' }}>
          + New floor
        </button>
      </div>

      {/* Plan name */}
      <div className="field" style={{ maxWidth: 340 }}>
        <label>Floor plan name *</label>
        <input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Building A · Floor 1" />
      </div>

      {/* Image upload */}
      <div className="field">
        <label>Floor plan image (PNG or JPG) *</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, background: 'var(--surface2)', fontWeight: 500 }}>
            {uploading ? '⏳ Uploading…' : imageUrl ? '🔄 Replace image' : '📤 Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} disabled={uploading} />
          </label>
          {imageUrl && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Image ready</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          Tip: export a screenshot from your CAD software, Google Maps, or even a photo works.
        </div>
      </div>

      {/* Editor canvas */}
      {imageUrl ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>🖱️ Click and drag to draw a zone · Click the × on a zone to delete it</span>
            {pendingZone && <span style={{ color: 'var(--accent)', fontWeight: 500 }}>Name the zone below and click Add</span>}
          </div>

          <div
            ref={containerRef}
            style={{
              position: 'relative', display: 'block',
              userSelect: 'none',
              cursor: pendingZone ? 'default' : 'crosshair',
              border: '2px solid var(--border)', borderRadius: 10,
              overflow: 'hidden', background: '#000',
              maxWidth: '100%',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            <img src={imageUrl} alt="Floor plan" draggable={false}
              style={{ display: 'block', width: '100%', pointerEvents: 'none' }} />

            {/* Existing zones */}
            {zones.map(zone => (
              <div key={zone.id} style={{
                position: 'absolute',
                left: `${zone.x}%`, top: `${zone.y}%`,
                width: `${zone.w}%`, height: `${zone.h}%`,
                border: '2px solid var(--accent)',
                background: 'rgba(83,74,183,0.18)',
                borderRadius: 4,
                boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 40, minHeight: 24,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                  background: 'rgba(255,255,255,0.9)', padding: '1px 6px',
                  borderRadius: 4, maxWidth: '90%', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}>
                  {zone.label}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteZone(zone.id) }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', top: -9, right: -9,
                    width: 18, height: 18, borderRadius: '50%',
                    border: 'none', background: '#e24b4a', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}>
                  ×
                </button>
              </div>
            ))}

            {/* Live drawing preview */}
            {draft && draft.w > 1 && draft.h > 1 && (
              <div style={{
                position: 'absolute',
                left: `${draft.x}%`, top: `${draft.y}%`,
                width: `${draft.w}%`, height: `${draft.h}%`,
                border: '2px dashed var(--accent)',
                background: 'rgba(83,74,183,0.08)',
                pointerEvents: 'none', boxSizing: 'border-box',
              }} />
            )}

            {/* Pending zone: name input overlay */}
            {pendingZone && (
              <div style={{
                position: 'absolute',
                left: `${pendingZone.x}%`, top: `${pendingZone.y}%`,
                width: `${pendingZone.w}%`, height: `${pendingZone.h}%`,
                border: '2px solid var(--accent2)',
                background: 'rgba(83,74,183,0.12)',
                borderRadius: 4, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                minWidth: 120, minHeight: 60,
              }}>
                <input
                  autoFocus
                  value={pendingLabel}
                  onChange={e => setPendingLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmZone(); if (e.key === 'Escape') cancelPending() }}
                  placeholder="Zone name…"
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ width: '80%', maxWidth: 160, padding: '4px 8px', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 12, textAlign: 'center', background: '#fff' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); confirmZone() }}
                    style={{ padding: '3px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Add
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); cancelPending() }}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--surface2)', borderRadius: 10, marginBottom: 20, border: '2px dashed var(--border)' }}>
          Upload a floor plan image above to start drawing zones
        </div>
      )}

      {/* Zone chips summary */}
      {zones.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {zones.length} zone{zones.length !== 1 ? 's' : ''} defined
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {zones.map(zone => (
              <span key={zone.id} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '4px 12px 4px 14px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                📍 {zone.label}
                <button onClick={() => deleteZone(zone.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>
          {saving ? 'Saving…' : activePlanId ? 'Save changes' : 'Create floor plan'}
        </button>
        {activePlanId && (
          <button className="btn" onClick={deletePlan} style={{ color: '#e24b4a', borderColor: '#e24b4a' }}>
            Delete floor plan
          </button>
        )}
        {zones.length === 0 && imageUrl && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Draw at least one zone before saving</span>
        )}
      </div>
    </div>
  )
}
