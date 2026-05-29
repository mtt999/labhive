import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'

async function sendBookingEmail(userId, type, subject, title, body) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs[`email_${type}`] !== true) return
  const { data: user } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
  const toEmail = user?.phone || user?.email
  if (!toEmail) return
  let orgContact = null
  if (user?.organization_id) {
    const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
    orgContact = org
  }
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Booking in iLab →', ctaUrl: 'https://mtt999.github.io/ilab/?screen=booking', prefsUrl: 'https://mtt999.github.io/ilab/?screen=profile', orgContact })
  const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type })
  if (error) console.warn('Booking email queue failed:', error.message)
}

function canEdit(s) { return s?.role === 'admin' || s?.role === 'user' }

// Columns to select for booking lists — deliberately excludes photo blob columns
const BOOKING_COLS = 'id, equipment_id, user_id, user_name, title, start_time, end_time, status, notes, denied_reason, booked_on_behalf_of, requires_approval, is_retraining, cleanliness_status, after_photo_last_reminded_at, after_photo_reminder_count, updated_at, created_by'

async function compressImage(file, maxPx = 1200, quality = 0.78) {
  return new Promise(resolve => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      let { width, height } = img
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx }
        else { width = Math.round(width * maxPx / height); height = maxPx }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = blobUrl
  })
}

// Converts any image source (data URL or regular URL) to base64 string for AI
async function toBase64ForAI(src) {
  if (!src) return null
  if (src.startsWith('data:image/')) return src.split(',')[1]
  try {
    const resp = await fetch(src)
    const blob = await resp.blob()
    return await new Promise(res => {
      const reader = new FileReader()
      reader.onload = e => res(e.target.result.split(',')[1])
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

async function runCleanlinessAI(beforeSrc, afterSrc, bookingId, toast) {
  try {
    const { data: row } = await sb.from('settings').select('value').eq('key', 'anthropic_api_key').maybeSingle()
    if (!row?.value) { toast?.('AI check unavailable — API key not configured.'); return null }
    const [b64before, b64after] = await Promise.all([toBase64ForAI(beforeSrc), toBase64ForAI(afterSrc)])
    if (!b64before || !b64after) { toast?.('AI check failed — could not load photos.'); return null }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': row.value,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64before } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64after } },
            { type: 'text', text: 'Two photos of the same lab equipment area. First = BEFORE use, second = AFTER use. Compare carefully. Identify any cleanliness issues: spills, debris, items left behind, equipment not returned to position, disorder. Reply with JSON only — no prose: {"status":"pass","findings":[]} or {"status":"needs_attention","findings":["specific issue 1","specific issue 2"]}. Be specific and concise.' }
          ]
        }]
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json()
    const text = json.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return null
    const result = JSON.parse(match[0])
    await sb.from('equipment_bookings').update({
      cleanliness_status: result.status,
      cleanliness_findings: result.findings || [],
    }).eq('id', bookingId)
    return result
  } catch (e) {
    console.warn('AI cleanliness check failed:', e)
    toast?.('AI analysis failed — photos saved.')
    return null
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768)
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return isMobile
}
function isAdmin(s) { return s?.role === 'admin' }

// ── Date helpers ──────────────────────────────────────────────
function startOfWeek(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() - day)
  dt.setHours(0, 0, 0, 0)
  return dt
}
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt }
function addMonths(d, n) { const dt = new Date(d); dt.setMonth(dt.getMonth() + n); return dt }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function sameDay(a, b) { return a.toDateString() === b.toDateString() }
function fmt(d, opts) { return new Date(d).toLocaleDateString('en-US', opts) }
function fmtTime(d) { return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
function fmtDateTime(d) { return `${fmt(d, { month: 'short', day: 'numeric' })} ${fmtTime(d)}` }

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i) // 0=12:00am, 1=12:30am, 2=1:00am...
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const statusColor = { confirmed: '#1e4d39', pending: '#92400e', denied: '#a32d2d', cancelled: '#5f5e5a' }
const statusBg = { confirmed: '#e8f2ee', pending: '#fef3c7', denied: '#fcebeb', cancelled: '#f1efe8' }

// ── Booking Form Modal ────────────────────────────────────────
function BookingModal({ booking, equipmentList, selectedEquipment, session, onSave, onClose, initialSlot, photoRequired }) {
  const { toast } = useAppStore()

  // Parse existing booking title to restore purpose type on edit
  const inferPurpose = (title) => {
    if (!title) return { type: '', projectId: '', other: '' }
    if (title.startsWith('Project:')) return { type: 'project', projectId: '', other: '' }
    if (title === 'Thesis') return { type: 'thesis', projectId: '', other: '' }
    if (title.startsWith('Other:')) return { type: 'other', projectId: '', other: title.replace('Other: ', '') }
    return { type: '', projectId: '', other: '' }
  }
  const saved = inferPurpose(booking?.title)

  const [form, setForm] = useState({
    equipment_id: booking?.equipment_id || selectedEquipment?.id || '',
    start_time: booking?.start_time ? new Date(booking.start_time).toISOString().slice(0,16) : (initialSlot?.start || ''),
    end_time: booking?.end_time ? new Date(booking.end_time).toISOString().slice(0,16) : (initialSlot?.end || ''),
    notes: booking?.notes || '',
    booked_on_behalf_of: booking?.booked_on_behalf_of || '',
    purposeType: saved.type,
    purposeProjectId: saved.projectId,
    purposeOther: saved.other,
  })
  const [students, setStudents] = useState([])
  const [projects, setProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(null)

  useEffect(() => {
    if (isAdmin(session)) {
      let q = sb.from('users').select('id, name').eq('is_active', true).neq('role', 'admin').order('name')
      if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
      q.then(({ data }) => setStudents(data || []))
    }
    if (session?.userId) {
      const isSolo = session.loginMode === 'solo' || session.role === 'solo'
      let q = sb.from('projects').select('id, name, project_id').eq('status', 'active').order('project_id')
      if (isSolo) { q = q.eq('solo_owner_id', session.userId) }
      else if (session.organizationId) { q = q.eq('organization_id', session.organizationId) }
      else { q = q.or(`pi_user_id.eq.${session.userId},student_ids.cs.{${session.userId}}`) }
      q.then(({ data }) => setProjects(data || []))
    }
  }, [])

  useEffect(() => { if (form.equipment_id && form.start_time && form.end_time) checkConflict() }, [form.equipment_id, form.start_time, form.end_time])

  async function checkConflict() {
    if (!form.equipment_id || !form.start_time || !form.end_time) return
    // Convert local datetime strings to UTC ISO for correct Supabase comparison
    const startUTC = new Date(form.start_time).toISOString()
    const endUTC = new Date(form.end_time).toISOString()
    const { data } = await sb.from('equipment_bookings')
      .select('*').eq('equipment_id', form.equipment_id)
      .neq('status', 'cancelled').neq('status', 'denied')
      .lt('start_time', endUTC).gt('end_time', startUTC)
    const conflicts = (data || []).filter(b => b.id !== booking?.id)
    setConflict(conflicts.length > 0 ? conflicts[0] : null)
  }

  async function save() {
    if (!form.equipment_id) { toast('Select equipment.'); return }
    if (!form.start_time || !form.end_time) { toast('Please drag on the calendar to select a time slot.'); return }
    if (conflict) { toast('This time slot conflicts with an existing booking.'); return }
    setSaving(true)
    // Check if equipment requires approval for this user
    let requiresApproval = false
    try {
      const { data: settings } = await sb.from('equipment_booking_settings')
        .select('requires_approval').eq('equipment_id', form.equipment_id).maybeSingle()
      requiresApproval = (settings?.requires_approval ?? false) && !isAdmin(session)
    } catch (e) { requiresApproval = false }
    const selectedProject = projects.find(p => p.id === form.purposeProjectId)
    const purposeTitle =
      form.purposeType === 'project' ? `Project: ${selectedProject?.project_id || selectedProject?.name || ''}` :
      form.purposeType === 'thesis'  ? 'Thesis' :
      form.purposeType === 'other'   ? `Other: ${form.purposeOther.trim()}` : null

    const payload = {
      equipment_id: form.equipment_id,
      user_id: session.userId,
      user_name: session.username,
      title: purposeTitle,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
      notes: form.notes || null,
      status: requiresApproval ? 'pending' : 'confirmed',
      requires_approval: !!requiresApproval,
      created_by: session.username,
      booked_on_behalf_of: form.booked_on_behalf_of || null,
      updated_at: new Date().toISOString(),
    }
    if (booking) {
      await sb.from('equipment_bookings').update(payload).eq('id', booking.id)
      toast('Booking updated ✓')
    } else {
      const { data: newBooking } = await sb.from('equipment_bookings').insert(payload).select('id').single()
      toast(requiresApproval ? 'Booking submitted — pending approval.' : 'Booking confirmed ✓')
      if (!requiresApproval && session.userId && newBooking?.id) {
        const eqName = equipmentList.find(e => e.id === form.equipment_id)?.nickname || 'equipment'
        const when = fmtDateTime(form.start_time)
        const tasks = [
          sendBookingEmail(
            session.userId, 'booking_confirmed',
            `Booking confirmed — ${eqName}`,
            `Your booking is confirmed`,
            `Your booking for ${eqName} on ${when} has been confirmed. See you then!`
          ),
        ]
        if (photoRequired) {
          tasks.push(
            sb.from('booking_notifications').insert({
              booking_id: newBooking.id, user_id: session.userId,
              type: 'before_photo_reminder',
              message: `📸 Booking confirmed for ${eqName} at ${when}. When you arrive, open this booking to take a before photo of the equipment.`,
              read: false,
            })
          )
        }
        await Promise.all(tasks)
      }
    }
    setSaving(false); onSave(); onClose()
  }

  const eq = equipmentList.find(e => e.id === form.equipment_id)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>{booking ? 'Edit booking' : 'New booking'}</div>

        <div className="field"><label>Equipment *</label>
          <select value={form.equipment_id} onChange={e => setForm(f => ({ ...f, equipment_id: e.target.value }))}>
            <option value="">— Select equipment —</option>
            {equipmentList.map(e => <option key={e.id} value={e.id}>{e.nickname || e.equipment_name}</option>)}
          </select>
        </div>

        {isAdmin(session) && (
          <div className="field"><label>Book on behalf of (optional)</label>
            <select value={form.booked_on_behalf_of} onChange={e => setForm(f => ({ ...f, booked_on_behalf_of: e.target.value }))}>
              <option value="">— Myself (Admin) —</option>
              {students.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Read-only time info from drag selection */}
        {form.start_time && form.end_time && (
          <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>📅 Selected time</div>
            <div style={{ color: 'var(--text2)' }}>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtDateTime(form.start_time)}</span>
              <span style={{ margin: '0 8px', color: 'var(--text3)' }}>→</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtDateTime(form.end_time)}</span>
            </div>
          </div>
        )}

        <div className="field">
          <label>Purpose of use</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {[
              { id: 'project', icon: '🧪', label: 'Project' },
              { id: 'thesis',  icon: '📚', label: 'Thesis'  },
              { id: 'other',   icon: '📝', label: 'Other'   },
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setForm(f => ({ ...f, purposeType: opt.id, purposeProjectId: '', purposeOther: '' }))}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
                  border: form.purposeType === opt.id ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                  background: form.purposeType === opt.id ? 'var(--accent-light)' : 'var(--surface2)',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 3 }}>{opt.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: form.purposeType === opt.id ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</div>
              </div>
            ))}
          </div>

          {form.purposeType === 'project' && (
            <div style={{ marginTop: 10 }}>
              {projects.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>No active projects found. Create one in Project &amp; Material first.</div>
              ) : (
                <select
                  value={form.purposeProjectId}
                  onChange={e => setForm(f => ({ ...f, purposeProjectId: e.target.value }))}
                >
                  <option value="">— Select a project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_id || p.name}</option>)}
                </select>
              )}
            </div>
          )}

          {form.purposeType === 'thesis' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 8 }}>
              <span style={{ fontSize: 16 }}>📚</span>
              <span style={{ fontSize: 13, color: '#0369a1', fontWeight: 500 }}>Booking for thesis research.</span>
            </div>
          )}

          {form.purposeType === 'other' && (
            <input
              type="text"
              value={form.purposeOther}
              onChange={e => setForm(f => ({ ...f, purposeOther: e.target.value }))}
              placeholder="Describe the reason (e.g. Lab guest, training…)"
              maxLength={120}
              style={{ marginTop: 10 }}
            />
          )}
        </div>

        {conflict && (
          <div style={{ background: '#fcebeb', border: '1px solid #f09595', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#a32d2d' }}>
            ⚠️ Conflict with <strong>{conflict.user_name}</strong>'s booking ({fmtDateTime(conflict.start_time)} – {fmtDateTime(conflict.end_time)})
          </div>
        )}

        <div className="field"><label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !!conflict}>{saving ? 'Saving…' : booking ? 'Update' : 'Book'}</button>
          <button className="btn" onClick={() => { setConflict(null); onClose() }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Week View Calendar ────────────────────────────────────────
// Each slot = 30 min, height = 24px. Total grid height = 48 * 24 = 1152px
const SLOT_H = 24 // px per 30-min slot
const TOTAL_H = 48 * SLOT_H // 1152px

function timeToSlotOffset(date) {
  // Returns pixel offset from top of grid (midnight = 0)
  return (date.getHours() * 60 + date.getMinutes()) / 30 * SLOT_H
}

function localFmt(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function WeekView({ weekStart, bookings, onSlotClick, onBookingClick, canBook }) {
  const [drag, setDrag] = useState(null)
  const colRefs = useRef([])
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  function yToSlot(y) {
    return Math.max(0, Math.min(47, Math.floor(y / SLOT_H)))
  }

  function getDayAndSlotFromMouse(e) {
    for (let di = 0; di < 7; di++) {
      const col = colRefs.current[di]
      if (!col) continue
      const rect = col.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        const y = e.clientY - rect.top
        const slot = yToSlot(y)
        return { di, slot }
      }
    }
    return null
  }

  function handleMouseDown(e, di) {
    if (!canBook) return
    const col = colRefs.current[di]
    if (!col) return
    const rect = col.getBoundingClientRect()
    const slot = yToSlot(e.clientY - rect.top)
    setDrag({ startDayIdx: di, startSlot: slot, endDayIdx: di, endSlot: slot })
    e.preventDefault()
  }

  // Use global mousemove so drag works across columns
  useEffect(() => {
    function onMouseMove(e) {
      if (!drag) return
      const result = getDayAndSlotFromMouse(e)
      if (!result) return
      setDrag(d => ({ ...d, endDayIdx: result.di, endSlot: result.slot }))
    }
    function onMouseUp(e) {
      if (!drag) return
      let { startDayIdx, startSlot, endDayIdx, endSlot } = drag
      const startAbs = startDayIdx * 48 + startSlot
      const endAbs = endDayIdx * 48 + endSlot
      if (startAbs > endAbs) {
        [startDayIdx, startSlot, endDayIdx, endSlot] = [endDayIdx, endSlot, startDayIdx, startSlot]
      }
      const start = new Date(days[startDayIdx])
      start.setHours(Math.floor(startSlot / 2), (startSlot % 2) * 30, 0, 0)
      const end = new Date(days[endDayIdx])
      const endSlotFinal = endSlot + 1
      if (endSlotFinal >= 48) {
        end.setDate(end.getDate() + 1)
        end.setHours(0, 0, 0, 0)
      } else {
        end.setHours(Math.floor(endSlotFinal / 2), (endSlotFinal % 2) * 30, 0, 0)
      }
      setDrag(null)
      onSlotClick({ start: localFmt(start), end: localFmt(end) })
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [drag])

  // Calculate booking position within a specific day column
  function getBookingSegment(b, dayIdx) {
    const bStart = new Date(b.start_time)
    const bEnd = new Date(b.end_time)
    const dayStart = new Date(days[dayIdx]); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(days[dayIdx]); dayEnd.setHours(24, 0, 0, 0)

    // Does this booking overlap with this day?
    if (bEnd <= dayStart || bStart >= dayEnd) return null

    const segStart = bStart < dayStart ? dayStart : bStart
    const segEnd = bEnd > dayEnd ? dayEnd : bEnd

    const top = timeToSlotOffset(segStart) + (segStart <= dayStart ? 0 : 0)
    const segStartMins = (segStart.getHours() * 60 + segStart.getMinutes())
    const segEndMins = Math.min(24 * 60, segEnd.getHours() * 60 + segEnd.getMinutes() + (segEnd.getDate() > segStart.getDate() ? 24 * 60 : 0))
    const heightPx = Math.max(22, ((segEndMins - segStartMins) / 30) * SLOT_H - 2)
    const topPx = (segStartMins / 30) * SLOT_H

    const isStart = sameDay(bStart, days[dayIdx])
    const isEnd = sameDay(bEnd, days[dayIdx]) || (bEnd <= dayEnd)
    return { top: topPx, height: heightPx, isStart, isEnd }
  }

  // Drag highlight: which cells are highlighted
  function isDragHighlighted(di, slot) {
    if (!drag) return false
    const cur = di * 48 + slot
    const a = drag.startDayIdx * 48 + drag.startSlot
    const b = drag.endDayIdx * 48 + drag.endSlot
    return cur >= Math.min(a, b) && cur <= Math.max(a, b)
  }

  return (
    <div className='booking-week-scroll' style={{ userSelect: 'none', overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 240px)' }}>

      {/* Sticky header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', minWidth: 500, position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
        <div style={{ height: 40 }} />
        {days.map((day, i) => (
          <div key={i} style={{ height: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 11, borderLeft: '1px solid var(--border)', background: sameDay(day, today) ? 'var(--accent-light)' : 'var(--surface)' }}>
            <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }}>{DAYS[day.getDay()]}</div>
            <div style={{ fontWeight: sameDay(day, today) ? 700 : 500, fontSize: 13, color: sameDay(day, today) ? 'var(--accent)' : 'var(--text)' }}>{day.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', minWidth: 500, position: 'relative' }}>
        {/* Time labels column */}
        <div style={{ position: 'relative', height: TOTAL_H }}>
          {HOURS.map(h => (
            <div key={h} style={{ position: 'absolute', top: h * 2 * SLOT_H, right: 4, fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
              {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, di) => (
          <div key={di} ref={el => colRefs.current[di] = el}
            style={{ position: 'relative', height: TOTAL_H, borderLeft: '1px solid var(--border)', cursor: canBook ? 'crosshair' : 'default' }}
            onMouseDown={e => handleMouseDown(e, di)}>

            {/* Hour lines */}
            {HOURS.map(h => (
              <React.Fragment key={h}>
                <div style={{ position: 'absolute', top: h * 2 * SLOT_H, left: 0, right: 0, borderTop: '1px solid var(--border)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: h * 2 * SLOT_H + SLOT_H, left: 0, right: 0, borderTop: '1px dashed var(--surface2)', pointerEvents: 'none' }} />
              </React.Fragment>
            ))}

            {/* Drag highlight */}
            {drag && (() => {
              const startAbs = drag.startDayIdx * 48 + drag.startSlot
              const endAbs = drag.endDayIdx * 48 + drag.endSlot
              const minAbs = Math.min(startAbs, endAbs)
              const maxAbs = Math.max(startAbs, endAbs)
              const colStart = di * 48
              const colEnd = di * 48 + 47
              if (maxAbs < colStart || minAbs > colEnd) return null
              const visStart = Math.max(minAbs, colStart) - colStart
              const visEnd = Math.min(maxAbs, colEnd) - colStart
              const top = visStart * SLOT_H
              const height = (visEnd - visStart + 1) * SLOT_H
              return <div style={{ position: 'absolute', top, left: 2, right: 2, height, background: 'rgba(26,93,56,0.15)', borderRadius: 4, pointerEvents: 'none', zIndex: 1 }} />
            })()}

            {/* Bookings — overlap-aware lane layout for this day */}
            {(() => {
              const dayStart = new Date(days[di]); dayStart.setHours(0, 0, 0, 0)
              const dayEnd   = new Date(days[di]); dayEnd.setHours(24, 0, 0, 0)
              // All bookings that touch this day, sorted by start
              const visible = bookings
                .filter(b => new Date(b.end_time) > dayStart && new Date(b.start_time) < dayEnd)
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
              // Greedy lane assignment: find first lane whose last booking ends before this one starts
              const laneOf = new Map()
              const laneEnd = []
              for (const b of visible) {
                const bStart = new Date(b.start_time)
                const bEnd   = new Date(b.end_time)
                let lane = laneEnd.findIndex(end => bStart >= end)
                if (lane === -1) lane = laneEnd.length
                laneOf.set(b.id, lane)
                laneEnd[lane] = bEnd
              }
              // For each booking, count how many lanes overlap with its time span
              const totalOf = new Map()
              for (const b of visible) {
                const bStart = new Date(b.start_time)
                const bEnd   = new Date(b.end_time)
                let maxLane = laneOf.get(b.id)
                for (const b2 of visible) {
                  if (new Date(b2.start_time) < bEnd && new Date(b2.end_time) > bStart) {
                    maxLane = Math.max(maxLane, laneOf.get(b2.id))
                  }
                }
                totalOf.set(b.id, maxLane + 1)
              }
              return bookings.map(b => {
                const seg = getBookingSegment(b, di)
                if (!seg) return null
                const lane  = laneOf.get(b.id) ?? 0
                const total = totalOf.get(b.id) ?? 1
                const br = [
                  seg.isStart ? '4px' : '0',
                  seg.isEnd ? '4px' : '0',
                  seg.isEnd ? '4px' : '0',
                  seg.isStart ? '4px' : '0',
                ].join(' ')
                const leftVal  = total > 1 ? `calc(2px + ${lane} * (100% - 4px) / ${total})` : 2
                const rightVal = total > 1 ? `calc(2px + ${total - lane - 1} * (100% - 4px) / ${total})` : 2
                return (
                  <div key={`${b.id}-${di}`}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onBookingClick(b) }}
                    style={{ position: 'absolute', top: seg.top + 1, left: leftVal, right: rightVal, height: seg.height, background: statusBg[b.status], border: `1px solid ${statusColor[b.status]}50`, borderLeft: `3px solid ${statusColor[b.status]}`, borderRadius: br, padding: '2px 5px', fontSize: 10, overflow: 'hidden', zIndex: 2, cursor: 'pointer' }}>
                    {seg.isStart && (
                      <>
                        <div style={{ fontWeight: 600, color: statusColor[b.status], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.booked_on_behalf_of || b.user_name}
                        </div>
                        {seg.height > 30 && b.title && <div style={{ color: statusColor[b.status], opacity: 0.8, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>}
                        {seg.height > 44 && <div style={{ color: statusColor[b.status], opacity: 0.6, fontSize: 9 }}>{fmtTime(b.start_time)} →</div>}
                      </>
                    )}
                    {!seg.isStart && seg.height > 20 && (
                      <div style={{ color: statusColor[b.status], opacity: 0.7, fontSize: 9 }}>↑ cont.</div>
                    )}
                    {seg.isEnd && !seg.isStart && seg.height > 20 && (
                      <div style={{ color: statusColor[b.status], fontSize: 9, position: 'absolute', bottom: 2, left: 5 }}>→ {fmtTime(b.end_time)}</div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Month View Calendar ───────────────────────────────────────
function MonthView({ monthDate, bookings, onDayClick, onBookingClick }) {
  const start = startOfMonth(monthDate)
  const end = endOfMonth(monthDate)
  const gridStart = startOfWeek(start)
  const days = []
  let cur = new Date(gridStart)
  while (cur <= end || days.length % 7 !== 0) {
    days.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  const today = new Date()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)' }}>{d}</div>
        ))}
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === monthDate.getMonth()
          const isToday = sameDay(day, today)
          const dayBookings = bookings.filter(b => sameDay(new Date(b.start_time), day))
          return (
            <div key={i} onClick={() => onDayClick(day)}
              style={{ minHeight: 80, padding: '4px 6px', border: '0.5px solid var(--border)', background: isToday ? 'var(--accent-light)' : isCurrentMonth ? 'var(--surface)' : 'var(--surface2)', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = isCurrentMonth ? 'var(--surface)' : 'var(--surface2)' }}>
              <div style={{ fontWeight: isToday ? 700 : 400, fontSize: 13, color: isToday ? 'var(--accent)' : isCurrentMonth ? 'var(--text)' : 'var(--text3)', marginBottom: 2 }}>{day.getDate()}</div>
              {dayBookings.slice(0, 3).map(b => (
                <div key={b.id} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onBookingClick(b) }}
                  style={{ fontSize: 10, background: statusBg[b.status], color: statusColor[b.status], borderRadius: 3, padding: '1px 4px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  {fmtTime(b.start_time)} {b.booked_on_behalf_of || b.user_name}
                </div>
              ))}
              {dayBookings.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{dayBookings.length - 3} more</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Live camera overlay with reference ghost ──────────────────
function CameraOverlay({ referenceUrl, onCapture, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const streamRef = useRef(null)

  useEffect(() => {
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }
        })
        streamRef.current = s
        if (videoRef.current) { videoRef.current.srcObject = s; setReady(true) }
      } catch(e) { setError('Camera unavailable: ' + e.message) }
    }
    start()
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  function capture() {
    const v = videoRef.current; const c = canvasRef.current
    if (!v || !c) return
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCapture(c.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 600, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: ready ? 'block' : 'none' }} />
        {!ready && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" style={{ width: 36, height: 36 }} />
          </div>
        )}
        {referenceUrl && ready && (
          <>
            <img src={referenceUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12, padding: '5px 14px', borderRadius: 99, whiteSpace: 'nowrap' }}>
              Align with the ghost image
            </div>
          </>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, padding: 28, textAlign: 'center', gap: 14 }}>
            <span style={{ fontSize: 36 }}>📷</span>
            <span>{error}</span>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13 }}>Use file upload instead</button>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ padding: '20px 28px', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onClose} style={{ color: '#fff', background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
        <button onClick={capture} disabled={!ready}
          style={{ width: 70, height: 70, borderRadius: '50%', background: ready ? '#fff' : '#666', border: '4px solid rgba(255,255,255,0.5)', cursor: ready ? 'pointer' : 'not-allowed', flexShrink: 0 }} />
        <div style={{ width: 80 }} />
      </div>
    </div>
  )
}

// ── Equipment Condition (before/after photos + AI check) ──────
function CleanlinessSection({ booking, session, eqName, onUpdated }) {
  const { toast } = useAppStore()
  const isMobile = useIsMobile()

  // Photo URLs (stored in Supabase for manager access)
  const [beforeUrl, setBeforeUrl] = useState(null)
  const [afterUrl, setAfterUrl] = useState(null)
  const [status, setStatus] = useState(null)
  const [findings, setFindings] = useState([])
  const [waived, setWaived] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)

  // Equipment reference photo (set by lab manager)
  const [referenceUrl, setReferenceUrl] = useState(null)
  const [referenceInstruction, setReferenceInstruction] = useState(null)

  // UI
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [camera, setCamera] = useState(null) // 'before' | 'after' | null
  const [showWaiveConfirm, setShowWaiveConfirm] = useState(false)
  const [waiveSent, setWaiveSent] = useState(false)
  const [reviewSent, setReviewSent] = useState(false)

  const beforeUrlRef = useRef(null) // keeps in sync with beforeUrl for stale-closure safety
  const busyRef = useRef(false)

  const isOwn = booking.user_id === session?.userId || booking.user_name === session?.username
  const isAdmin_ = isAdmin(session)

  // Before photo allowed from 7am on booking day (or if booking day is in the past)
  const bookingDayAt7am = new Date(booking.start_time)
  bookingDayAt7am.setHours(7, 0, 0, 0)
  const canTakeBeforePhoto = new Date() >= bookingDayAt7am

  useEffect(() => {
    Promise.all([
      sb.from('equipment_bookings')
        .select('before_photo_url, after_photo_url, cleanliness_status, cleanliness_findings, before_photo_waived, after_photo_attempt_count')
        .eq('id', booking.id).single(),
      sb.from('equipment_booking_settings')
        .select('reference_photo_url, photo_instruction')
        .eq('equipment_id', booking.equipment_id).maybeSingle(),
    ]).then(([{ data: bk }, { data: cfg }]) => {
      if (bk) {
        setBeforeUrl(bk.before_photo_url || null); beforeUrlRef.current = bk.before_photo_url || null
        setAfterUrl(bk.after_photo_url || null)
        setStatus(bk.cleanliness_status || null)
        setFindings(bk.cleanliness_findings || [])
        setWaived(!!bk.before_photo_waived)
        setAttemptCount(bk.after_photo_attempt_count || 0)
      }
      if (cfg) { setReferenceUrl(cfg.reference_photo_url || null); setReferenceInstruction(cfg.photo_instruction || null) }
      setLoaded(true)
    })
  }, [booking.id])

  async function uploadPhoto(dataUrl, type) {
    // Upload to Supabase shared storage so managers can view for reviews
    const blob = await (await fetch(dataUrl)).blob()
    const path = `equipment-photos/${booking.id}-${type}-${Date.now()}.jpg`
    const { error } = await sb.storage.from('project-files').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    return sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
  }

  async function handleCaptured(dataUrl, type) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try {
      const publicUrl = await uploadPhoto(dataUrl, type)

      if (type === 'before') {
        await sb.from('equipment_bookings').update({ before_photo_url: publicUrl }).eq('id', booking.id)
        setBeforeUrl(publicUrl); beforeUrlRef.current = publicUrl
        // Dismiss all before_photo_reminder notifications for this booking
        await sb.from('booking_notifications').update({ read: true })
          .eq('booking_id', booking.id).eq('user_id', session.userId).eq('type', 'before_photo_reminder')
        toast('Before photo saved ✓')
        onUpdated?.()
        busyRef.current = false; setBusy(false)
      } else {
        const newCount = attemptCount + 1
        await sb.from('equipment_bookings').update({ after_photo_url: publicUrl, after_photo_attempt_count: newCount }).eq('id', booking.id)
        setAfterUrl(publicUrl)
        setAttemptCount(newCount)
        busyRef.current = false; setBusy(false)

        const beforeForAI = beforeUrlRef.current
        if (beforeForAI) {
          toast('After photo saved — analyzing…')
          setAnalyzing(true)
          const result = await runCleanlinessAI(beforeForAI, publicUrl, booking.id, toast)
          if (result) {
            setStatus(result.status); setFindings(result.findings || [])
            // 2nd failure → send both photos to managers for review
            if (result.status === 'needs_attention' && newCount >= 2 && session.organizationId && !reviewSent) {
              setReviewSent(true)
              await notifyManagersForReview(publicUrl)
            }
          }
          setAnalyzing(false)
        } else {
          toast('After photo saved ✓')
        }
        onUpdated?.()
        return
      }
    } catch(e) { toast('Save failed: ' + e.message); busyRef.current = false; setBusy(false) }
  }

  async function notifyManagersForReview(afterPhotoUrl) {
    const { data: managers } = await sb.from('users')
      .select('id').eq('organization_id', session.organizationId)
      .in('role', ['admin', 'user']).eq('is_active', true)
    const meta = {
      booking_id: booking.id, booking_user_id: session.userId, user_name: session.username,
      eq_name: eqName || 'equipment', before_photo_url: beforeUrlRef.current, after_photo_url: afterPhotoUrl,
    }
    for (const mgr of (managers || [])) {
      if (mgr.id === session.userId) continue
      await sb.from('booking_notifications').insert({
        booking_id: booking.id, user_id: mgr.id, type: 'after_photo_review',
        message: `📸 ${session.username}'s after photo for ${meta.eq_name} needs review — 2nd attempt still failed AI check.`,
        read: false, meta,
      }).catch(() => {})
    }
  }

  async function handleWaiveBefore() {
    setWaiveSent(true)
    try {
      await sb.from('equipment_bookings').update({ before_photo_waived: true }).eq('id', booking.id)
      setWaived(true)
      if (session.organizationId) {
        const { data: managers } = await sb.from('users')
          .select('id').eq('organization_id', session.organizationId)
          .in('role', ['admin', 'user']).eq('is_active', true)
        const meta = { booking_id: booking.id, booking_user_id: session.userId, user_name: session.username, eq_name: eqName || 'equipment' }
        for (const mgr of (managers || [])) {
          if (mgr.id === session.userId) continue
          await sb.from('booking_notifications').insert({
            booking_id: booking.id, user_id: mgr.id, type: 'waive_before_photo',
            message: `⚠️ ${session.username} requested to skip the before photo for ${meta.eq_name}.`,
            read: false, meta,
          }).catch(() => {})
        }
      }
      toast('Waive request sent to lab managers.')
      setShowWaiveConfirm(false)
      onUpdated?.()
    } catch(e) { toast('Failed: ' + e.message); setWaiveSent(false) }
  }

  function handleFile(file, type) {
    if (busyRef.current) return
    compressImage(file, 1200, 0.78).then(dataUrl => handleCaptured(dataUrl, type))
  }

  function openCamera(type) {
    if (!navigator.mediaDevices?.getUserMedia) {
      document.getElementById(`cleanliness-file-${type}-${booking.id}`)?.click()
      return
    }
    setCamera(type)
  }

  if (!loaded) return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
      <div className="spinner" style={{ margin: '8px auto', width: 16, height: 16 }} />
    </div>
  )
  if (!isOwn && !isAdmin_ && !beforeUrl && !afterUrl) return null

  const labelStyle = { fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 5, fontWeight: 600 }
  const emptyBox = (extra) => ({ width: '100%', aspectRatio: '4/3', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', gap: 4, ...extra })
  const uploadBox = (disabled) => ({ width: '100%', aspectRatio: '4/3', border: '2px dashed var(--accent)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--accent-light)', opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' })

  const needsRetake = isOwn && afterUrl && status === 'needs_attention'
  const showAfterWaiveInfo = needsRetake && attemptCount >= 2

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 12 }}>

      {/* Camera overlay — always uses reference photo as ghost for both before and after */}
      {camera && (
        <CameraOverlay
          referenceUrl={referenceUrl}
          onCapture={url => { setCamera(null); handleCaptured(url, camera) }}
          onClose={() => setCamera(null)}
        />
      )}

      {/* Header + info toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>📸 Equipment Condition</div>
        <button className="btn btn-sm" onClick={() => setShowInfo(s => !s)} style={{ fontSize: 11 }}>
          {showInfo ? 'Hide' : 'ℹ️ Why photos?'}
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: '#0369a1', lineHeight: 1.6 }}>
          <strong>Why we require photos:</strong>
          <ul style={{ margin: '5px 0 8px', padding: '0 0 0 16px' }}>
            <li>Before photo confirms equipment was in good condition when you started.</li>
            <li>After photo confirms you left it clean and ready for the next user.</li>
            <li>Together they protect you and others in case of disputes.</li>
            <li>Lab managers review these if an issue is reported.</li>
          </ul>
          <strong>How to take a good photo:</strong>
          <ul style={{ margin: '5px 0 0', padding: '0 0 0 16px' }}>
            <li>Step back enough to show the whole work area and equipment.</li>
            <li>Ensure the photo is well-lit and in focus.</li>
            {referenceInstruction && <li>{referenceInstruction}</li>}
            {referenceUrl && <li>A reference image is shown in the camera — align your shot to match the ghost overlay.</li>}
          </ul>
        </div>
      )}

      {/* Desktop hint */}
      {isOwn && !isMobile && !beforeUrl && !waived && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#0369a1', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📱</span>
          <span><strong>On a desktop?</strong> Open iLab on your phone for easier photo capture — or upload an image file below.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>

        {/* ── Before ── */}
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Before</div>
          {beforeUrl ? (
            <img src={beforeUrl} onClick={() => window.open(beforeUrl)} title="Tap to enlarge"
              style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in', display: 'block' }} />
          ) : waived ? (
            <div style={emptyBox()}>
              <span style={{ fontSize: 20 }}>✋</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '0 6px' }}>
                {waiveSent ? 'Waive sent — awaiting manager' : 'Before photo waived'}
              </span>
            </div>
          ) : isOwn && !canTakeBeforePhoto ? (
            <div style={emptyBox({ border: '1px dashed #f0d070', background: '#fef9e7' })}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <span style={{ fontSize: 11, color: '#92400e', textAlign: 'center', padding: '0 8px' }}>
                Available from 7am on {new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ) : isOwn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={uploadBox(busy)} onClick={() => !busy && openCamera('before')}>
                {busy ? <div className="spinner" style={{ width: 18, height: 18 }} />
                  : <><span style={{ fontSize: 22 }}>📷</span><span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, textAlign: 'center', padding: '0 6px' }}>Take before photo</span></>}
              </div>
              <label style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', cursor: 'pointer', textDecoration: 'underline dotted' }}>
                or upload file
                <input id={`cleanliness-file-before-${booking.id}`} type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f, 'before') }} />
              </label>
              {/* Waive option */}
              {!showWaiveConfirm ? (
                <button onClick={() => setShowWaiveConfirm(true)}
                  style={{ fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline dotted', padding: '2px 0', textAlign: 'left' }}>
                  Need to waive before photo?
                </button>
              ) : (
                <div style={{ background: '#fef3c7', border: '1px solid #f0d070', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ color: '#92400e', fontWeight: 500, marginBottom: 6 }}>Waive before photo?</div>
                  <div style={{ color: '#78350f', fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
                    A notification will be sent to lab managers — they can approve or ask you to take one next time.
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-danger" onClick={handleWaiveBefore} disabled={busy || waiveSent}>Send waive request</button>
                    <button className="btn btn-sm" onClick={() => setShowWaiveConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={emptyBox()}><span style={{ fontSize: 11, color: 'var(--text3)' }}>No photo</span></div>
          )}
        </div>

        {/* ── After ── */}
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>After</div>
          {afterUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <img src={afterUrl} onClick={() => window.open(afterUrl)} title="Tap to enlarge"
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, border: `1px solid ${status === 'needs_attention' ? '#f09595' : 'var(--border)'}`, cursor: 'zoom-in', display: 'block' }} />
              {/* Retake button when needs_attention */}
              {isOwn && status === 'needs_attention' && (
                <div style={uploadBox(busy || analyzing)} onClick={() => !(busy || analyzing) && openCamera('after')}>
                  {busy || analyzing ? <div className="spinner" style={{ width: 18, height: 18 }} />
                    : <><span style={{ fontSize: 18 }}>🔄</span><span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Retake after photo</span></>}
                </div>
              )}
            </div>
          ) : isOwn && (beforeUrl || waived) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={uploadBox(busy || analyzing)} onClick={() => !(busy || analyzing) && openCamera('after')}>
                {busy || analyzing ? <div className="spinner" style={{ width: 18, height: 18 }} />
                  : <><span style={{ fontSize: 22 }}>📷</span><span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, textAlign: 'center', padding: '0 6px' }}>Take after photo</span></>}
              </div>
              <label style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', cursor: 'pointer', textDecoration: 'underline dotted' }}>
                or upload file
                <input id={`cleanliness-file-after-${booking.id}`} type="file" accept="image/*" style={{ display: 'none' }} disabled={busy || analyzing}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f, 'after') }} />
              </label>
            </div>
          ) : (
            <div style={emptyBox()}>
              <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '0 8px' }}>
                {isOwn && !beforeUrl && !waived ? 'Take before photo first' : 'No photo'}
              </span>
            </div>
          )}
        </div>

      </div>

      {analyzing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', padding: '9px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 8 }}>
          <div className="spinner" style={{ width: 14, height: 14 }} />
          Analyzing photos with AI…
        </div>
      )}

      {status && (
        <div style={{ padding: '10px 14px', background: status === 'pass' ? '#e8f2ee' : '#fcebeb', border: `1px solid ${status === 'pass' ? '#9FE1CB' : '#f09595'}`, borderRadius: 8, fontSize: 13, marginBottom: 6 }}>
          <div style={{ fontWeight: 600, color: status === 'pass' ? '#1e4d39' : '#a32d2d', marginBottom: findings.length ? 6 : 0 }}>
            {status === 'pass' ? '✅ Area clean — great job!' : '⚠️ Needs attention'}
          </div>
          {findings.length > 0 && (
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#a32d2d', lineHeight: 1.7 }}>
              {findings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* First failure: prompt to fix and retake */}
      {isOwn && needsRetake && attemptCount < 2 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f0d070', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
          Please fix the issue above, then use the Retake button to take a new after photo.
        </div>
      )}

      {/* Second failure: inform user photos sent to manager */}
      {isOwn && showAfterWaiveInfo && (
        <div style={{ background: '#fcebeb', border: '1px solid #f09595', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#a32d2d' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Second attempt failed</div>
          <div style={{ lineHeight: 1.5 }}>
            {reviewSent
              ? '📩 Both photos have been sent to a lab manager for review. They will follow up shortly.'
              : 'Your photos have been sent to a lab manager for review.'}
          </div>
        </div>
      )}

      {isOwn && beforeUrl && !afterUrl && !analyzing && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          Take or upload your after photo when done — AI will check for cleanliness issues automatically.
        </div>
      )}
    </div>
  )
}

// ── Booking Detail Modal ──────────────────────────────────────
function BookingDetail({ booking, equipment, session, onEdit, onDelete, onDeny, onClose, onApprove, onUpdated, photoRequired }) {
  const [denyReason, setDenyReason] = useState('')
  const [showDenyForm, setShowDenyForm] = useState(false)

  const eq = equipment
  const isOwn = booking.user_id === session.userId || booking.user_name === session.username

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 440, width: '100%', border: '1px solid var(--border)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{eq?.nickname || eq?.equipment_name || 'Equipment'}</div>
            <span style={{ background: statusBg[booking.status], color: statusColor[booking.status], borderRadius: 99, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>{booking.status}</span>
          </div>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text3)' }}>Booked by: </span><strong>{booking.booked_on_behalf_of ? `${booking.booked_on_behalf_of} (via ${booking.user_name})` : booking.user_name}</strong></div>
          <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text3)' }}>Start: </span>{fmtDateTime(booking.start_time)}</div>
          <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text3)' }}>End: </span>{fmtDateTime(booking.end_time)}</div>
          {booking.title && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text3)' }}>Purpose: </span>{booking.title}</div>}
          {booking.notes && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text3)' }}>Notes: </span>{booking.notes}</div>}
          {booking.denied_reason && <div style={{ fontSize: 13, color: '#a32d2d' }}><span style={{ color: 'var(--text3)' }}>Denied: </span>{booking.denied_reason}</div>}
        </div>

        {/* Deny form */}
        {showDenyForm && (
          <div style={{ marginBottom: 16 }}>
            <div className="field"><label>Reason for denial (optional)</label>
              <textarea rows={2} value={denyReason} onChange={e => setDenyReason(e.target.value)} style={{ resize: 'vertical' }} placeholder="e.g. Equipment under maintenance" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-danger" onClick={() => onDeny(booking, denyReason)}>Confirm deny</button>
              <button className="btn btn-sm" onClick={() => setShowDenyForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(isOwn || isAdmin(session)) && booking.status !== 'cancelled' && (
            <button className="btn btn-sm" onClick={() => onEdit(booking)}>✏️ Edit</button>
          )}
          {isAdmin(session) && booking.status === 'pending' && (
            <button className="btn btn-sm btn-primary" onClick={() => onApprove(booking)}>✓ Approve</button>
          )}
          {isAdmin(session) && booking.status !== 'denied' && booking.status !== 'cancelled' && !showDenyForm && (
            <button className="btn btn-sm btn-danger" onClick={() => setShowDenyForm(true)}>✕ Deny</button>
          )}
          {(isOwn || isAdmin(session)) && booking.status !== 'cancelled' && (
            <button className="btn btn-sm" style={{ color: 'var(--accent2)' }} onClick={() => onDelete(booking)}>🗑 Cancel</button>
          )}
        </div>

        {photoRequired && <CleanlinessSection booking={booking} session={session} eqName={eq?.nickname || eq?.equipment_name} onUpdated={onUpdated} />}
      </div>
    </div>
  )
}

// ── Multi-Equipment Booking Modal ─────────────────────────────
function MultiBookingModal({ equipmentList, defaultSlot, session, onSave, onClose }) {
  const { toast } = useAppStore()
  const [times, setTimes] = useState(
    Object.fromEntries(equipmentList.map(e => [e.id, { start: defaultSlot?.start || '', end: defaultSlot?.end || '' }]))
  )
  const [purposes, setPurposes] = useState([])
  const [notes, setNotes]       = useState('')
  const [behalf, setBehalf]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  function setTime(id, field, val) {
    setTimes(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  function applyToAll(id) {
    const src = times[id]
    setTimes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, { ...src }])))
    toast('Time applied to all equipment ✓')
  }

  async function bookAll() {
    for (const e of equipmentList) {
      const t = times[e.id]
      if (!t.start || !t.end) { toast(`Set time for: ${e.nickname || e.equipment_name}`); return }
      if (new Date(t.start) >= new Date(t.end)) { toast(`End must be after start for: ${e.nickname || e.equipment_name}`); return }
    }
    setSaving(true)
    const title = purposes.join(', ')
    let failed = 0
    for (const e of equipmentList) {
      const t = times[e.id]
      const { error } = await sb.from('equipment_bookings').insert({
        equipment_id: e.id,
        user_id: session.userId,
        user_name: session.username,
        title,
        start_time: new Date(t.start).toISOString(),
        end_time:   new Date(t.end).toISOString(),
        status: 'confirmed',
        notes: notes.trim() || null,
        booked_on_behalf_of: behalf.trim() || null,
        created_by: session.username,
      })
      if (error) failed++
    }
    setSaving(false)
    if (failed > 0) toast(`${failed} booking(s) failed — check conflicts.`)
    else toast(`${equipmentList.length} bookings confirmed ✓`)
    onSave(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 580, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Book {equipmentList.length} Equipment</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Set a time for each. Purpose and notes apply to all.</div>

        {/* Per-equipment time rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {equipmentList.map(e => {
            const t = times[e.id]
            const isEditing = editingId === e.id
            const hasTime = t.start && t.end
            return (
              <div key={e.id} style={{ background: 'var(--surface2)', border: `1.5px solid ${isEditing ? 'var(--accent)' : hasTime ? 'var(--border)' : '#f0c070'}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEditing ? 10 : 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{e.nickname || e.equipment_name}</span>
                  {!isEditing && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: hasTime ? 'var(--text2)' : '#a0762a' }}>
                        {hasTime ? `${fmtDateTime(t.start)} → ${fmtDateTime(t.end)}` : 'No time set'}
                      </span>
                      <button className="btn btn-sm" onClick={() => setEditingId(e.id)} style={{ fontSize: 11, padding: '2px 10px' }}>📅 Edit</button>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Start</label>
                        <input type="datetime-local" value={t.start} onChange={ev => setTime(e.id, 'start', ev.target.value)} style={{ fontSize: 12 }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 11 }}>End</label>
                        <input type="datetime-local" value={t.end} onChange={ev => setTime(e.id, 'end', ev.target.value)} style={{ fontSize: 12 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>✓ Done</button>
                      <button className="btn btn-sm" onClick={() => applyToAll(e.id)} style={{ fontSize: 11 }}>Copy to all</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Book on behalf of */}
        <div className="field">
          <label>Book on behalf of (optional)</label>
          <input value={behalf} onChange={e => setBehalf(e.target.value)} placeholder="e.g. student name" />
        </div>

        {/* Purpose */}
        <div className="field">
          <label>Purpose (select all that apply)</label>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Project', 'Thesis', 'Other'].map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={purposes.includes(p)} onChange={ev => setPurposes(prev => ev.target.checked ? [...prev, p] : prev.filter(x => x !== p))} />
                {p}
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes applied to all bookings…" style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={bookAll} disabled={saving}>
            {saving ? 'Booking…' : `Book All ${equipmentList.length}`}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Block user from booking ───────────────────────────────────
function BlockUserModal({ notification, session, onClose, onDone }) {
  const { toast } = useAppStore()
  const [blockType, setBlockType] = useState('equipment')
  const [duration, setDuration] = useState(1)
  const [blocking, setBlocking] = useState(false)
  const meta = notification.meta || {}

  async function block() {
    setBlocking(true)
    const unblockAt = new Date()
    unblockAt.setDate(unblockAt.getDate() + duration)
    try {
      await sb.from('equipment_booking_blocks').insert({
        user_id: meta.booking_user_id, user_name: meta.user_name,
        equipment_id: blockType === 'equipment' ? meta.equipment_id : null,
        organization_id: session.organizationId,
        blocked_by_name: session.username,
        reason: 'Missing after photo', block_type: blockType,
        unblock_at: unblockAt.toISOString(),
      })
      await sb.from('booking_notifications').update({ read: true }).eq('id', notification.id)
      toast(`${meta.user_name} blocked from booking for ${duration} day${duration !== 1 ? 's' : ''}.`)
      onDone(); onClose()
    } catch(e) { toast('Block failed: ' + e.message) }
    setBlocking(false)
  }

  async function ignore() {
    await sb.from('booking_notifications').update({ read: true }).eq('id', notification.id)
    onDone(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Missing After Photo</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
          <strong>{meta.user_name}</strong> did not upload an after photo for <strong>{meta.eq_name}</strong>.
          Choose an action:
        </div>

        <div className="field">
          <label>Block scope</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{k:'equipment',l:'This equipment only'},{k:'all',l:'All equipment in org'}].map(opt => (
              <div key={opt.k} onClick={() => setBlockType(opt.k)}
                style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: `2px solid ${blockType === opt.k ? 'var(--accent2)' : 'var(--border)'}`, background: blockType === opt.k ? '#fef3c7' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center', fontSize: 12, fontWeight: blockType === opt.k ? 600 : 400 }}>
                {opt.l}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Duration</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,3,5,14].map(d => (
              <div key={d} onClick={() => setDuration(d)}
                style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${duration === d ? '#a32d2d' : 'var(--border)'}`, background: duration === d ? '#fcebeb' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: duration === d ? 700 : 400, color: duration === d ? '#a32d2d' : 'var(--text)' }}>
                {d}d
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" onClick={ignore} style={{ flex: 1 }}>Ignore</button>
          <button className="btn btn-sm btn-danger" onClick={block} disabled={blocking} style={{ flex: 1 }}>
            {blocking ? 'Blocking…' : `Block ${duration} day${duration !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Waive Response Modal (managers respond to waive_before_photo) ──
function WaiveResponseModal({ notification, session, onClose, onDone }) {
  const { toast } = useAppStore()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const meta = notification.meta || {}

  async function respond(accept) {
    setSaving(true)
    try {
      const msg = accept
        ? `✅ Your request to skip the before photo for ${meta.eq_name || 'equipment'} was accepted by ${session.username}.${note ? ` Note: ${note}` : ''}`
        : `⚠️ Lab manager noted: next time a before photo is required for ${meta.eq_name || 'equipment'}.${note ? ` Note: ${note}` : ''}`
      if (meta.booking_user_id) {
        await sb.from('booking_notifications').insert({
          booking_id: notification.booking_id, user_id: meta.booking_user_id,
          type: 'waive_response', message: msg, read: false,
          meta: { accept, manager_name: session.username, note },
        })
      }
      await sb.from('booking_notifications').update({ read: true }).eq('id', notification.id)
      toast(accept ? 'Waive approved — user notified.' : 'Response sent — user notified.')
      onDone(); onClose()
    } catch(e) { toast('Failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Before Photo Waive Request</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.6 }}>
          <strong>{meta.user_name || 'A user'}</strong> wants to skip the before photo for <strong>{meta.eq_name || 'equipment'}</strong>.
        </div>
        <div className="field">
          <label>Note to user (optional)</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the user…" style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => onClose()} style={{ flex: 1 }} disabled={saving}>Cancel</button>
          <button className="btn btn-sm" onClick={() => respond(false)} disabled={saving}
            style={{ flex: 1, background: '#fef3c7', borderColor: '#f0d070', color: '#92400e', fontWeight: 600 }}>
            {saving ? '…' : 'Next time required'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => respond(true)} disabled={saving} style={{ flex: 1 }}>
            {saving ? '…' : 'OK — Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── After Photo Review Modal (managers review both photos after 2nd failure) ──
function AfterPhotoReviewModal({ notification, session, onClose, onDone }) {
  const { toast } = useAppStore()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const meta = notification.meta || {}

  async function respond(accept) {
    setSaving(true)
    try {
      const msg = accept
        ? `✅ Lab manager reviewed your photos for ${meta.eq_name || 'equipment'} and accepted.${note ? ` Note: ${note}` : ''}`
        : `⚠️ Lab manager reviewed your photos for ${meta.eq_name || 'equipment'}. Next time equipment cleanliness will be required.${note ? ` Note: ${note}` : ''}`
      if (meta.booking_user_id) {
        await sb.from('booking_notifications').insert({
          booking_id: notification.booking_id, user_id: meta.booking_user_id,
          type: 'waive_response', message: msg, read: false,
          meta: { accept, manager_name: session.username, note },
        })
      }
      await sb.from('booking_notifications').update({ read: true }).eq('id', notification.id)
      toast(accept ? 'Accepted — user notified.' : 'Response sent — user notified.')
      onDone(); onClose()
    } catch(e) { toast('Failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 480, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>After Photo Review</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          <strong>{meta.user_name || 'A user'}</strong>'s after photo for <strong>{meta.eq_name || 'equipment'}</strong> failed the AI check twice.
        </div>
        {(meta.before_photo_url || meta.after_photo_url) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {meta.before_photo_url && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4, letterSpacing: '0.06em' }}>Before</div>
                <img src={meta.before_photo_url} onClick={() => window.open(meta.before_photo_url)}
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in', display: 'block' }} />
              </div>
            )}
            {meta.after_photo_url && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4, letterSpacing: '0.06em' }}>After</div>
                <img src={meta.after_photo_url} onClick={() => window.open(meta.after_photo_url)}
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, border: '1px solid #f09595', cursor: 'zoom-in', display: 'block' }} />
              </div>
            )}
          </div>
        )}
        <div className="field">
          <label>Note to user (optional)</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please wipe down the bench before finishing next time…" style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => onClose()} style={{ flex: 1 }} disabled={saving}>Cancel</button>
          <button className="btn btn-sm" onClick={() => respond(false)} disabled={saving}
            style={{ flex: 1, background: '#fef3c7', borderColor: '#f0d070', color: '#92400e', fontWeight: 600 }}>
            {saving ? '…' : 'Next time required'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => respond(true)} disabled={saving} style={{ flex: 1 }}>
            {saving ? '…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 1 — BOOKING CALENDAR
// ══════════════════════════════════════════════════════════════
function BookingCalendar({ session }) {
  const { toast, scanEquipmentId, clearScanEquipmentId, setScreen } = useAppStore()
  const [fromQRScan] = useState(() => !!scanEquipmentId)
  const [equipment, setEquipment] = useState([])
  const [selectedEq, setSelectedEq] = useState([])
  const [bookings, setBookings] = useState([])
  const [calView, setCalView] = useState('week')
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()))
  const [monthDate, setMonthDate] = useState(new Date())
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showMultiModal, setShowMultiModal] = useState(false)
  const [multiSlot, setMultiSlot] = useState(null)
  const [bookingDraft, setBookingDraft] = useState(null)
  const [editBooking, setEditBooking] = useState(null)
  const [detailBooking, setDetailBooking] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [blockingNotif, setBlockingNotif] = useState(null)
  const [waiveModal, setWaiveModal] = useState(null)
  const [reviewModal, setReviewModal] = useState(null)

  useEffect(() => { loadEquipment(); loadNotifications() }, [])
  useEffect(() => { loadBookings() }, [selectedEq, weekStart, monthDate, calView])
  useEffect(() => { loadBookings() }, [])

  // Auto-select and open booking modal when arriving from a QR scan
  useEffect(() => {
    if (scanEquipmentId && equipment.length > 0) {
      setSelectedEq([scanEquipmentId])
      setShowBookingModal(true)
      clearScanEquipmentId()
    }
  }, [scanEquipmentId, equipment])
  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadBookings, 30000)
    return () => clearInterval(interval)
  }, [selectedEq, weekStart, monthDate, calView])
  // Hourly after-photo reminder check
  useEffect(() => {
    const interval = setInterval(() => checkPhotoReminders(equipmentRef.current), 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const [retrainingBlocked, setRetrainingBlocked] = useState([])
  const [activeBlock, setActiveBlock] = useState(null)
  const [photoRequired, setPhotoRequired] = useState(false)
  const photoRequiredRef = useRef(false)
  const orgEqIdsRef = useRef(null)
  const equipmentRef = useRef([])

  async function loadEquipment() {
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('equipment_inventory').select('id, equipment_name, nickname, category, location').eq('is_active', true).eq('login_mode', isSolo ? 'solo' : 'team').order('category').order('nickname')
    if (!isSolo) q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setEquipment(data || [])
    equipmentRef.current = data || []
    if (!isSolo && session?.userId && session?.organizationId) {
      orgEqIdsRef.current = (data || []).map(e => e.id)
    }
    setLoading(false)
    loadBookings()
    await checkRetrainingStatus(data || [])
    await loadActiveBlock()
    await loadPhotoRequired()         // must run before checkPhotoReminders so the ref is set
    await checkPhotoReminders(data || [])
  }

  async function checkRetrainingStatus(eqList) {
    if (!session.userId) return
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    // Get all confirmed bookings for this user
    const { data: userBookings } = await sb.from('equipment_bookings')
      .select('equipment_id, start_time').eq('user_id', session.userId).eq('status', 'confirmed')
    if (!userBookings?.length) return
    // Find last booking date per equipment
    const lastBooked = {}
    userBookings.forEach(b => {
      const t = new Date(b.start_time)
      if (!lastBooked[b.equipment_id] || t > lastBooked[b.equipment_id]) lastBooked[b.equipment_id] = t
    })
    // Get retraining requests for this user
    const { data: retraining } = await sb.from('retraining_requests')
      .select('equipment_id, status').eq('user_id', session.userId)
    const approvedEq = new Set((retraining || []).filter(r => r.status === 'approved').map(r => r.equipment_id))
    const pendingEq = new Set((retraining || []).filter(r => r.status === 'pending').map(r => r.equipment_id))
    // Block equipment not used in 3 months without approved retraining
    const blocked = Object.entries(lastBooked)
      .filter(([eqId, lastDate]) => lastDate < threeMonthsAgo && !approvedEq.has(eqId))
      .map(([eqId]) => eqId)
    setRetrainingBlocked(blocked)
    // Add in-app notification for newly blocked items (not already pending)
    for (const eqId of blocked) {
      if (!pendingEq.has(eqId)) {
        const eq = eqList.find(e => e.id === eqId)
        if (!eq) continue
        const msg = `Retraining required: you haven't used ${eq.nickname || eq.equipment_name} in over 3 months.`
        try {
          await sb.from('booking_notifications').insert({
            booking_id: null, user_id: session.userId,
            type: 'retraining_required', message: msg, read: false,
          })
        } catch(e) {}
      }
    }
  }

  async function loadActiveBlock() {
    if (!session?.userId) return
    const now = new Date().toISOString()
    const { data } = await sb.from('equipment_booking_blocks')
      .select('*').eq('user_id', session.userId).gt('unblock_at', now).limit(1).maybeSingle()
    setActiveBlock(data || null)
  }

  async function loadPhotoRequired() {
    if (!session?.organizationId) return
    const { data } = await sb.from('organizations')
      .select('require_equipment_photos').eq('id', session.organizationId).maybeSingle()
    const val = data?.require_equipment_photos === true
    setPhotoRequired(val)
    photoRequiredRef.current = val
  }

  async function checkPhotoReminders(eqList) {
    if (!session?.userId || !photoRequiredRef.current) return
    const now = new Date()
    const hour = now.getHours()
    // Quiet hours: no reminders between 11pm and 8am
    if (hour >= 23 || hour < 8) return

    // 1. Before-photo reminder: fires at 7am on booking day (same calendar day as start_time)
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const { data: started } = await sb.from('equipment_bookings')
      .select('id, equipment_id, start_time, before_photo_notified_at')
      .eq('user_id', session.userId).eq('status', 'confirmed')
      .is('before_photo_url', null).is('before_photo_notified_at', null)
      .gte('start_time', `${todayStr}T00:00:00`)
      .lt('start_time', `${todayStr}T23:59:59`)
    let didInsert = false
    for (const b of (started || [])) {
      const eq = eqList.find(e => e.id === b.equipment_id)
      const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
      try {
        await sb.from('booking_notifications').insert({
          booking_id: b.id, user_id: session.userId,
          type: 'before_photo_reminder',
          message: `📸 Your booking for ${eqName} has started. Open the booking to take your before photo now.`,
          read: false,
        })
        await sb.from('equipment_bookings').update({ before_photo_notified_at: now.toISOString() }).eq('id', b.id)
        didInsert = true
      } catch(e) {}
    }

    // 2. After-photo reminders: booking ended, no after photo
    const { data: overdue } = await sb.from('equipment_bookings')
      .select('id, equipment_id, user_id, user_name, end_time, after_photo_last_reminded_at, after_photo_reminder_count, lab_notified_at')
      .eq('user_id', session.userId).eq('status', 'confirmed')
      .is('after_photo_url', null).lt('end_time', now.toISOString())
    for (const b of (overdue || [])) {
      const endTime = new Date(b.end_time)
      const oneHourAfterEnd = new Date(endTime.getTime() + 60 * 60 * 1000)
      const nextDay8am = new Date(endTime)
      nextDay8am.setDate(nextDay8am.getDate() + 1); nextDay8am.setHours(8, 0, 0, 0)
      const eq = eqList.find(e => e.id === b.equipment_id)
      const eqName = eq?.nickname || eq?.equipment_name || 'equipment'
      const count = b.after_photo_reminder_count || 0
      const lastReminded = b.after_photo_last_reminded_at ? new Date(b.after_photo_last_reminded_at) : null

      // Window expired → notify lab managers (once)
      if (now >= nextDay8am) {
        if (!b.lab_notified_at && session.organizationId) {
          const { data: managers } = await sb.from('users')
            .select('id').eq('organization_id', session.organizationId)
            .in('role', ['admin', 'user']).eq('is_active', true)
          const meta = { booking_user_id: session.userId, user_name: b.user_name || session.username, equipment_id: b.equipment_id, eq_name: eqName, booking_id: b.id }
          for (const mgr of (managers || [])) {
            if (mgr.id === session.userId) continue
            try {
              await sb.from('booking_notifications').insert({
                booking_id: b.id, user_id: mgr.id,
                type: 'missing_photo_manager',
                message: `⚠️ ${meta.user_name} did not upload an after photo for ${eqName} (booking ended ${fmtDateTime(b.end_time)}).`,
                read: false, meta,
              })
            } catch(e) {}
          }
          try { await sb.from('equipment_bookings').update({ lab_notified_at: now.toISOString() }).eq('id', b.id) } catch(e) {}
        }
        continue
      }

      // Skip if reminded within the last hour
      if (lastReminded && now - lastReminded < 60 * 60 * 1000) continue

      // First reminder vs last warning (after 1h past end time)
      const isLastWarning = count >= 1 && now >= oneHourAfterEnd
      const type = isLastWarning ? 'after_photo_last_warning' : 'after_photo_reminder'
      const message = isLastWarning
        ? `⚠️ Last reminder: upload your after photo for ${eqName}. If not uploaded, you may lose the ability to book this equipment.`
        : `📸 After photo needed for ${eqName} — booking ended ${fmtDateTime(b.end_time)}. Tap to open.`
      try {
        await sb.from('booking_notifications').insert({ booking_id: b.id, user_id: session.userId, type, message, read: false })
        await sb.from('equipment_bookings').update({
          after_photo_last_reminded_at: now.toISOString(),
          after_photo_reminder_count: count + 1,
        }).eq('id', b.id)
        didInsert = true
      } catch(e) {}
    }
    if (didInsert) loadNotifications()
  }

  async function loadBookings() {
    let start, end
    if (calView === 'week') {
      start = weekStart.toISOString()
      end = addDays(weekStart, 7).toISOString()
    } else {
      start = startOfMonth(monthDate).toISOString()
      end = addDays(endOfMonth(monthDate), 1).toISOString()
    }
    const scopedIds = orgEqIdsRef.current
    if (scopedIds !== null && scopedIds.length === 0) { setBookings([]); return }
    let query = sb.from('equipment_bookings').select(BOOKING_COLS)
      .gte('start_time', start).lt('start_time', end)
      .order('start_time')
    if (selectedEq.length > 0) {
      // Always show selected equipment bookings (for availability) + own bookings (personal schedule)
      const eqFilter = `equipment_id.in.(${selectedEq.join(',')})`
      const ownFilter = session?.userId ? `,user_id.eq.${session.userId}` : ''
      query = query.or(`${eqFilter}${ownFilter}`)
    } else if (scopedIds !== null) {
      query = query.in('equipment_id', scopedIds)
    }
    const { data } = await query
    // Show all except cancelled on calendar — cancelled slots are available again
    setBookings((data || []).filter(b => b.status !== 'cancelled'))
  }

  async function loadNotifications() {
    if (!session.userId) return
    const { data } = await sb.from('booking_notifications').select('*')
      .eq('user_id', session.userId).eq('read', false)
    setNotifications(data || [])
  }

  async function dismissNotification(id) {
    await sb.from('booking_notifications').update({ read: true }).eq('id', id)
    loadNotifications()
  }

  function toggleEquipment(id) {
    setSelectedEq(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])
  }

  function handleSlotClick(slot) {
    if (selectedEq.length === 0) return
    // Check booking block
    if (activeBlock) {
      const unblockDate = new Date(activeBlock.unblock_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      if (activeBlock.block_type === 'all') {
        alert(`🚫 Booking blocked\n\nYou are currently blocked from booking any equipment until ${unblockDate}.\n\nReason: ${activeBlock.reason || 'Missing after photo'}`)
        return
      }
      const blockedEq = selectedEq.filter(id => id === activeBlock.equipment_id)
      if (blockedEq.length > 0) {
        const eqName = equipment.find(e => e.id === activeBlock.equipment_id)?.nickname || 'this equipment'
        alert(`🚫 Booking blocked\n\nYou are currently blocked from booking ${eqName} until ${unblockDate}.\n\nReason: ${activeBlock.reason || 'Missing after photo'}`)
        return
      }
    }
    const blockedSelected = selectedEq.filter(id => retrainingBlocked.includes(id))
    if (blockedSelected.length > 0) {
      const names = blockedSelected.map(id => equipment.find(e => e.id === id)?.nickname || 'equipment').join(', ')
      alert(`⚠️ Retraining required\n\n${names} requires retraining before booking. Please go to the Training Records tab and submit a retraining request.`)
      return
    }
    if (selectedEq.length > 1) {
      setMultiSlot(slot); setShowMultiModal(true)
    } else {
      setBookingDraft(slot); setEditBooking(null); setShowBookingModal(true)
    }
  }

  function handleDayClick(day) {
    const start = new Date(day); start.setHours(9, 0, 0, 0)
    const end   = new Date(day); end.setHours(17, 0, 0, 0)
    const slot  = { start: start.toISOString().slice(0,16), end: end.toISOString().slice(0,16) }
    if (selectedEq.length > 1) {
      setMultiSlot(slot); setShowMultiModal(true)
    } else {
      setBookingDraft(slot); setEditBooking(null); setShowBookingModal(true)
    }
  }

  async function handleDeny(booking, reason) {
    await sb.from('equipment_bookings').update({ status: 'denied', denied_by: session.username, denied_reason: reason, updated_at: new Date().toISOString() }).eq('id', booking.id)
    const eqName = equipment.find(e => e.id === booking.equipment_id)?.nickname || 'equipment'
    const when = fmtDateTime(booking.start_time)
    const denyMsg = `Your booking for ${eqName} on ${when} was denied.${reason ? ` Reason: ${reason}` : ''}`
    await sb.from('booking_notifications').insert({ booking_id: booking.id, user_id: booking.user_id, type: 'denied', message: denyMsg })
    await sendBookingEmail(
      booking.user_id,
      'booking_confirmed',
      `Booking denied — ${eqName}`,
      `Your booking was not approved`,
      denyMsg
    )
    toast('Booking denied.'); setDetailBooking(null); loadBookings()
  }

  async function handleApprove(booking) {
    await sb.from('equipment_bookings').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', booking.id)
    const eqName = equipment.find(e => e.id === booking.equipment_id)?.nickname || 'equipment'
    const when = fmtDateTime(booking.start_time)
    await sb.from('booking_notifications').insert({ booking_id: booking.id, user_id: booking.user_id, type: 'approved', message: `Your booking for ${eqName} on ${when} was approved.` })
    await sendBookingEmail(
      booking.user_id,
      'booking_confirmed',
      `Booking approved — ${eqName}`,
      `Your booking has been approved`,
      `Your booking for ${eqName} on ${when} was approved by ${session.username}. See you then!`
    )
    toast('Booking approved ✓'); setDetailBooking(null); loadBookings()
  }

  async function handleCancel(booking) {
    if (!confirm('Cancel this booking?')) return
    setDetailBooking(null)
    await sb.from('equipment_bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', booking.id)
    const eqName = equipment.find(e => e.id === booking.equipment_id)?.nickname || 'equipment'
    const when = fmtDateTime(booking.start_time)
    await sendBookingEmail(
      booking.user_id,
      'booking_cancelled',
      `Booking cancelled — ${eqName}`,
      'Your booking has been cancelled',
      `Your booking for ${eqName} on ${when} has been cancelled.`
    )
    toast('Booking cancelled.')
    loadBookings()
  }

  const filteredEq = equipment.filter(e => {
    const q = search.toLowerCase()
    return (!q || [e.equipment_name, e.nickname, e.category, e.location].some(f => f?.toLowerCase().includes(q)))
      && (!filterCat || e.category === filterCat)
  })

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort()

  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Back to equipment scan — only shown when arriving via QR scan */}
      {fromQRScan && (
        <div style={{ width: '100%', marginBottom: 8 }}>
          <button
            onClick={() => setScreen('equipmentscan')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #b2dfcb', background: '#e8f2ee', fontSize: 13, fontWeight: 700, color: '#2a6049', cursor: 'pointer' }}
          >
            ← Back to options
          </button>
        </div>
      )}

      {/* ── Notifications — always at top ── */}
      {blockingNotif && (
        <BlockUserModal
          notification={blockingNotif} session={session}
          onClose={() => setBlockingNotif(null)}
          onDone={() => { setBlockingNotif(null); loadNotifications() }}
        />
      )}
      {waiveModal && (
        <WaiveResponseModal
          notification={waiveModal} session={session}
          onClose={() => setWaiveModal(null)}
          onDone={() => { setWaiveModal(null); loadNotifications() }}
        />
      )}
      {reviewModal && (
        <AfterPhotoReviewModal
          notification={reviewModal} session={session}
          onClose={() => setReviewModal(null)}
          onDone={() => { setReviewModal(null); loadNotifications() }}
        />
      )}

      {notifications.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {notifications.map(n => {
            const isBeforeReminder = n.type === 'before_photo_reminder'
            const isPhotoReminder = ['before_photo_reminder','after_photo_reminder'].includes(n.type)
            const isLastWarning = n.type === 'after_photo_last_warning'
            const isManagerAlert = n.type === 'missing_photo_manager'
            const isWaiveRequest = n.type === 'waive_before_photo'
            const isReviewRequest = n.type === 'after_photo_review'
            const isWaiveResponse = n.type === 'waive_response'
            const isDenied = n.type === 'denied'
            const isApproved = n.type === 'approved'

            const isManagerAction = isManagerAlert || isWaiveRequest || isReviewRequest
            const isPersistent = isBeforeReminder || isWaiveRequest || isReviewRequest // no X button

            const bg = isDenied || isLastWarning ? '#fcebeb'
              : isPhotoReminder || isManagerAlert || isWaiveRequest ? '#fef3c7'
              : isReviewRequest ? '#fce7f3'
              : isWaiveResponse ? '#e0f2fe'
              : '#e8f2ee'
            const border = isDenied || isLastWarning ? '#f09595'
              : isPhotoReminder || isManagerAlert || isWaiveRequest ? '#f0d070'
              : isReviewRequest ? '#f9a8d4'
              : isWaiveResponse ? '#bae6fd'
              : '#9FE1CB'
            const color = isDenied || isLastWarning ? '#a32d2d'
              : isPhotoReminder || isManagerAlert || isWaiveRequest ? '#92400e'
              : isReviewRequest ? '#9d174d'
              : isWaiveResponse ? '#0369a1'
              : '#1e4d39'

            const clickable = (isPhotoReminder || isLastWarning) && n.booking_id && !isBeforeReminder

            return (
              <div key={n.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color, cursor: clickable ? 'pointer' : 'default', flex: 1 }}
                    onClick={async () => {
                      if (!clickable) return
                      const { data } = await sb.from('equipment_bookings').select('*').eq('id', n.booking_id).single()
                      if (data) setDetailBooking(data)
                    }}>
                    {isDenied ? '✕ ' : isApproved ? '✓ ' : ''}{n.message}
                    {clickable && <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 500 }}>Tap to open →</span>}
                  </span>
                  {!isPersistent && (
                    <button onClick={() => dismissNotification(n.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>✕</button>
                  )}
                </div>

                {/* before_photo_reminder: tap to open booking (persistent, no auto-dismiss) */}
                {isBeforeReminder && n.booking_id && (
                  <button className="btn btn-sm btn-primary" style={{ marginTop: 10, fontSize: 11 }}
                    onClick={async () => {
                      const { data } = await sb.from('equipment_bookings').select('*').eq('id', n.booking_id).single()
                      if (data) setDetailBooking(data)
                    }}>
                    📷 Take before photo →
                  </button>
                )}

                {/* waive_before_photo: managers respond */}
                {isWaiveRequest && (isAdmin(session) || canEdit(session)) && (
                  <button className="btn btn-sm" style={{ marginTop: 10, fontSize: 11, background: '#fef3c7', borderColor: '#f0d070', color: '#92400e', fontWeight: 600 }}
                    onClick={() => setWaiveModal(n)}>
                    Respond →
                  </button>
                )}

                {/* after_photo_review: managers review both photos */}
                {isReviewRequest && (isAdmin(session) || canEdit(session)) && (
                  <button className="btn btn-sm btn-primary" style={{ marginTop: 10, fontSize: 11 }}
                    onClick={() => setReviewModal(n)}>
                    Review photos →
                  </button>
                )}

                {/* missing_photo_manager: block or ignore (lab managers / admins) */}
                {isManagerAlert && canEdit(session) && session?.role === 'user' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-sm" onClick={() => dismissNotification(n.id)} style={{ fontSize: 11 }}>Ignore</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setBlockingNotif(n)} style={{ fontSize: 11 }}>Block user…</button>
                  </div>
                )}
                {isManagerAlert && isAdmin(session) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-sm" onClick={() => dismissNotification(n.id)} style={{ fontSize: 11 }}>Dismiss</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>

      {/* ── Left: equipment selector ── */}
      <div style={{ width: isMobile ? '100%' : 220, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…" style={{ width: '100%', fontSize: 12 }} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {selectedEq.length > 0 && (
          <div style={{ padding: '6px 12px', background: 'var(--accent-light)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--accent)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{selectedEq.length} selected</span>
            <button onClick={() => setSelectedEq([])} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, padding: 0 }}>Clear</button>
          </div>
        )}
        <div style={{ maxHeight: isMobile ? 200 : 500, overflowY: 'auto' }}>
          {loading ? <div style={{ padding: 16, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            : filteredEq.map(e => (
              <div key={e.id} onClick={() => toggleEquipment(e.id)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '0.5px solid var(--surface2)', background: selectedEq.includes(e.id) ? 'var(--accent-light)' : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={ev => { if (!selectedEq.includes(e.id)) ev.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={ev => { if (!selectedEq.includes(e.id)) ev.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${selectedEq.includes(e.id) ? 'var(--accent)' : 'var(--border)'}`, background: selectedEq.includes(e.id) ? 'var(--accent)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedEq.includes(e.id) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: selectedEq.includes(e.id) ? 600 : 500, color: retrainingBlocked.includes(e.id) ? '#a32d2d' : selectedEq.includes(e.id) ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.nickname || e.equipment_name}
                    {retrainingBlocked.includes(e.id) && <span style={{ marginLeft: 4, fontSize: 9, background: '#fcebeb', color: '#a32d2d', borderRadius: 3, padding: '1px 4px' }}>RETRAIN</span>}
                  </div>
                  {e.location && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{e.location}</div>}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Right: calendar ── */}
      <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>

        {/* Calendar toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => { if (calView === 'week') setWeekStart(d => addDays(d, -7)); else setMonthDate(d => addMonths(d, -1)) }}>←</button>
            <div style={{ fontWeight: 600, fontSize: 15, minWidth: 180, textAlign: 'center' }}>
              {calView === 'week'
                ? `${fmt(weekStart, { month: 'short', day: 'numeric' })} – ${fmt(addDays(weekStart, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
                : `${MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`
              }
            </div>
            <button className="btn btn-sm" onClick={() => { if (calView === 'week') setWeekStart(d => addDays(d, 7)); else setMonthDate(d => addMonths(d, 1)) }}>→</button>
            <button className="btn btn-sm" onClick={() => { setWeekStart(startOfWeek(new Date())); setMonthDate(new Date()) }} style={{ fontSize: 11 }}>Today</button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm" style={{ background: calView === 'week' ? 'var(--accent-light)' : 'transparent', color: calView === 'week' ? 'var(--accent)' : 'var(--text2)', fontWeight: calView === 'week' ? 600 : 400 }} onClick={() => setCalView('week')}>Week</button>
            <button className="btn btn-sm" style={{ background: calView === 'month' ? 'var(--accent-light)' : 'transparent', color: calView === 'month' ? 'var(--accent)' : 'var(--text2)', fontWeight: calView === 'month' ? 600 : 400 }} onClick={() => setCalView('month')}>Month</button>
            <button className="btn btn-sm btn-primary" onClick={() => {
              if (selectedEq.length > 1) { setMultiSlot(null); setShowMultiModal(true) }
              else { setBookingDraft(null); setEditBooking(null); setShowBookingModal(true) }
            }}>+ Book</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          {Object.entries(statusColor).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: statusBg[s], border: `1px solid ${c}` }} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
          ))}
        </div>

        {calView === 'week' ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {selectedEq.length === 0 && (
              <div style={{ padding: '8px 14px', background: '#fef3c7', borderBottom: '1px solid #f0d070', fontSize: 12, color: '#92400e' }}>
                💡 Select equipment on the left to enable drag-to-book
              </div>
            )}
            <WeekView weekStart={weekStart} bookings={bookings} onSlotClick={handleSlotClick} onBookingClick={b => setDetailBooking(b)} canBook={selectedEq.length > 0} />
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {selectedEq.length === 0 && (
              <div style={{ padding: '8px 14px', background: '#fef3c7', borderBottom: '1px solid #f0d070', fontSize: 12, color: '#92400e' }}>
                💡 Select equipment on the left to enable booking
              </div>
            )}
            <MonthView monthDate={monthDate} bookings={bookings} onDayClick={handleDayClick} onBookingClick={b => setDetailBooking(b)} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showMultiModal && (
        <MultiBookingModal
          equipmentList={equipment.filter(e => selectedEq.includes(e.id))}
          defaultSlot={multiSlot}
          session={session}
          onSave={loadBookings}
          onClose={() => { setShowMultiModal(false); setMultiSlot(null) }}
        />
      )}
      {showBookingModal && (
        <BookingModal
          booking={editBooking}
          equipmentList={selectedEq.length > 0 ? equipment.filter(e => selectedEq.includes(e.id)) : equipment}
          selectedEquipment={selectedEq.length === 1 ? equipment.find(e => e.id === selectedEq[0]) : null}
          session={session}
          onSave={() => { loadBookings(); loadNotifications() }}
          onClose={() => { setShowBookingModal(false); setBookingDraft(null); setEditBooking(null) }}
          initialSlot={bookingDraft}
          photoRequired={photoRequired}
        />
      )}

      {detailBooking && (
        <BookingDetail
          booking={detailBooking}
          equipment={equipment.find(e => e.id === detailBooking.equipment_id)}
          session={session}
          onEdit={b => { setEditBooking(b); setDetailBooking(null); setShowBookingModal(true) }}
          onDelete={handleCancel}
          onDeny={handleDeny}
          onApprove={handleApprove}
          onClose={() => setDetailBooking(null)}
          onUpdated={loadBookings}
          photoRequired={photoRequired}
        />
      )}
    </div>
  </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 2 — HISTORY & USAGE
// ══════════════════════════════════════════════════════════════
function BookingHistory({ session }) {
  const { toast } = useAppStore()
  const [bookings, setBookings] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEq, setFilterEq] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const orgId = !isSolo && session?.userId ? session?.organizationId : null
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname, category').eq('is_active', true).order('nickname')
    if (orgId) eqQ = eqQ.eq('organization_id', orgId)
    const { data: eq } = await eqQ
    const orgEqIds = (eq || []).map(e => e.id)
    if (orgId && canEdit(session) && orgEqIds.length === 0) {
      setEquipment([]); setBookings([]); setLoading(false); return
    }
    let bkQ = canEdit(session)
      ? sb.from('equipment_bookings').select(BOOKING_COLS).order('start_time', { ascending: false }).limit(1000)
      : sb.from('equipment_bookings').select(BOOKING_COLS).eq('user_id', session.userId).order('start_time', { ascending: false })
    if (orgId && canEdit(session)) bkQ = bkQ.in('equipment_id', orgEqIds)
    const { data: bk } = await bkQ
    setEquipment(eq || [])
    setBookings(bk || [])
    setLoading(false)
  }

  const filtered = bookings.filter(b => {
    const eq = equipment.find(e => e.id === b.equipment_id)
    const q = search.toLowerCase()
    const bStart = new Date(b.start_time)
    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(timeFrom ? parseInt(timeFrom.split(':')[0]) : 0, timeFrom ? parseInt(timeFrom.split(':')[1]) : 0, 0, 0)
      if (bStart < from) return false
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(timeTo ? parseInt(timeTo.split(':')[0]) : 23, timeTo ? parseInt(timeTo.split(':')[1]) : 59, 59, 999)
      if (bStart > to) return false
    }
    return (!filterStatus || b.status === filterStatus)
      && (!filterEq || b.equipment_id === filterEq)
      && (!q || [b.user_name, b.title, eq?.nickname, eq?.equipment_name].some(f => f?.toLowerCase().includes(q)))
  })

  function toCSVRow(cols) {
    return cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
  }

  function exportCSV(rows, filename) {
    const headers = canEdit(session)
      ? ['Equipment', 'Nickname', 'Category', 'User', 'Purpose', 'Start', 'End', 'Duration (hrs)', 'Status', 'Notes', 'Denied Reason']
      : ['Equipment', 'Nickname', 'Purpose', 'Start', 'End', 'Duration (hrs)', 'Status']
    const lines = [headers.join(',')]
    rows.forEach(b => {
      const eq = equipment.find(e => e.id === b.equipment_id)
      const hrs = Math.round((new Date(b.end_time) - new Date(b.start_time)) / 360000) / 10
      if (canEdit(session)) {
        lines.push(toCSVRow([eq?.equipment_name||'', eq?.nickname||'', eq?.category||'', b.booked_on_behalf_of||b.user_name, b.title||'', fmtDateTime(b.start_time), fmtDateTime(b.end_time), hrs, b.status, b.notes||'', b.denied_reason||'']))
      } else {
        lines.push(toCSVRow([eq?.equipment_name||'', eq?.nickname||'', b.title||'', fmtDateTime(b.start_time), fmtDateTime(b.end_time), hrs, b.status]))
      }
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportFiltered() {
    if (filtered.length === 0) { toast('No records to export.'); return }
    const eqName = filterEq ? (equipment.find(e => e.id === filterEq)?.nickname || 'equipment') : 'all'
    const dateStr = dateFrom || new Date().toISOString().split('T')[0]
    exportCSV(filtered, `bookings_${eqName}_${dateStr}.csv`)
    toast(`Exported ${filtered.length} records.`)
  }

  function exportAll() {
    exportCSV(bookings, `bookings_all_${new Date().toISOString().split('T')[0]}.csv`)
    toast(`Exported ${bookings.length} total records.`)
  }

  // Usage stats per equipment from filtered results
  const usageStats = {}
  filtered.filter(b => b.status === 'confirmed').forEach(b => {
    const eq = equipment.find(e => e.id === b.equipment_id)
    const name = eq?.nickname || eq?.equipment_name || 'Unknown'
    if (!usageStats[name]) usageStats[name] = { count: 0, hours: 0 }
    usageStats[name].count++
    usageStats[name].hours += (new Date(b.end_time) - new Date(b.start_time)) / 3600000
  })

  return (
    <div>
      {/* Usage summary */}
      {Object.keys(usageStats).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>📊 Usage Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {Object.entries(usageStats).sort((a,b) => b[1].hours - a[1].hours).slice(0, 6).map(([name, stats]) => (
              <div key={name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>{Math.round(stats.hours)}h</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{stats.count} booking{stats.count !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text2)' }}>🔍 Filter & Export</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user or equipment…" style={{ flex: 1, minWidth: 160 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All statuses</option>
            {['confirmed','pending','denied','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterEq} onChange={e => setFilterEq(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All equipment</option>
            {equipment.map(e => <option key={e.id} value={e.id}>{e.nickname || e.equipment_name}</option>)}
          </select>
        </div>
        {/* Date & time range */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Date range:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12 }} />
            <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} style={{ fontSize: 12, width: 100 }} />
          </div>
          <span style={{ color: 'var(--text3)', fontSize: 13 }}>→</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12 }} />
            <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} style={{ fontSize: 12, width: 100 }} />
          </div>
          {(dateFrom || dateTo) && <button className="btn btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); setTimeFrom(''); setTimeTo('') }}>Clear</button>}
        </div>
        {/* Export buttons */}
        {canEdit(session) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={exportFiltered}>
              📥 Export filtered ({filtered.length} records)
            </button>
            <button className="btn btn-sm" onClick={exportAll}>
              📥 Export all ({bookings.length} records)
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        Showing <strong>{filtered.length}</strong> of <strong>{bookings.length}</strong> bookings
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">📅</div>No bookings found.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Equipment</th>
                  {canEdit(session) && <th>User</th>}
                  <th>Purpose</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Status</th>
                  {canEdit(session) && <th>Notes</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const eq = equipment.find(e => e.id === b.equipment_id)
                  const hours = Math.round((new Date(b.end_time) - new Date(b.start_time)) / 360000) / 10
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 500 }}>
                        {eq?.nickname || eq?.equipment_name || '—'}
                        {b.is_retraining && <span style={{ marginLeft: 6, fontSize: 10, background: '#e0f2fe', color: '#0369a1', borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>Retraining</span>}
                      </td>
                      {canEdit(session) && <td style={{ color: 'var(--text2)' }}>{b.booked_on_behalf_of || b.user_name}</td>}
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{b.title || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDateTime(b.start_time)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDateTime(b.end_time)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{hours}h</td>
                      <td><span style={{ background: statusBg[b.status], color: statusColor[b.status], borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{b.status}</span></td>
                      {canEdit(session) && <td style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 160 }}>{b.denied_reason || b.notes || '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB 3 — ADMIN SETTINGS
// ══════════════════════════════════════════════════════════════
function BookingSettings({ session }) {
  const { toast } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploadingRef, setUploadingRef] = useState(null) // eqId being uploaded
  const [editingInstruction, setEditingInstruction] = useState({}) // eqId → text
  const refFileRefs = useRef({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const orgId = !isSolo && session?.userId ? session?.organizationId : null
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('is_active', true).order('nickname')
    if (orgId) eqQ = eqQ.eq('organization_id', orgId)
    const [{ data: eq }, { data: s }] = await Promise.all([
      eqQ,
      sb.from('equipment_booking_settings').select('*'),
    ])
    setEquipment(eq || [])
    const map = {}; (s || []).forEach(r => map[r.equipment_id] = r); setSettings(map)
    // seed editing state with saved instructions
    const instr = {};(s || []).forEach(r => { if (r.photo_instruction) instr[r.equipment_id] = r.photo_instruction })
    setEditingInstruction(instr)
    setLoading(false)
  }

  async function toggleBookable(eqId) {
    const cur = settings[eqId]
    if (cur) {
      await sb.from('equipment_booking_settings').update({ bookable: !cur.bookable }).eq('equipment_id', eqId)
    } else {
      await sb.from('equipment_booking_settings').insert({ equipment_id: eqId, bookable: false })
    }
    toast('Setting updated.'); load()
  }

  async function toggleRequireApproval(eqId) {
    const cur = settings[eqId]
    if (cur) {
      await sb.from('equipment_booking_settings').update({ requires_approval: !cur.requires_approval }).eq('equipment_id', eqId)
    } else {
      await sb.from('equipment_booking_settings').insert({ equipment_id: eqId, requires_approval: true })
    }
    toast('Setting updated.'); load()
  }

  async function uploadReferencePhoto(eqId, file) {
    if (!file) return
    setUploadingRef(eqId)
    try {
      const url = await compressImage(file, 1400, 0.82)
      // Convert data URL to blob for storage upload
      const resp = await fetch(url)
      const blob = await resp.blob()
      const path = `booking-reference/${eqId}-${Date.now()}.jpg`
      const { error: upErr } = await sb.storage.from('project-files').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = sb.storage.from('project-files').getPublicUrl(path)
      const publicUrl = urlData.publicUrl
      const cur = settings[eqId]
      if (cur) {
        await sb.from('equipment_booking_settings').update({ reference_photo_url: publicUrl }).eq('equipment_id', eqId)
      } else {
        await sb.from('equipment_booking_settings').insert({ equipment_id: eqId, reference_photo_url: publicUrl })
      }
      toast('Reference photo saved ✓'); load()
    } catch (e) {
      toast('Upload failed: ' + e.message)
    } finally {
      setUploadingRef(null)
      if (refFileRefs.current[eqId]) refFileRefs.current[eqId].value = ''
    }
  }

  async function clearReferencePhoto(eqId) {
    await sb.from('equipment_booking_settings').update({ reference_photo_url: null }).eq('equipment_id', eqId)
    toast('Reference photo removed.'); load()
  }

  async function saveInstruction(eqId) {
    const text = (editingInstruction[eqId] || '').trim()
    const cur = settings[eqId]
    if (cur) {
      await sb.from('equipment_booking_settings').update({ photo_instruction: text || null }).eq('equipment_id', eqId)
    } else {
      await sb.from('equipment_booking_settings').insert({ equipment_id: eqId, photo_instruction: text || null })
    }
    toast('Instruction saved ✓'); load()
  }

  if (!isAdmin(session)) return <div className="empty-state"><div className="empty-icon">🔒</div>Admin only.</div>

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Equipment Booking Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Control which equipment can be booked and whether approval is required.</div>
      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 32 }}>
              <table style={{ fontSize: 13 }}>
                <thead><tr><th>Equipment</th><th>Bookable</th><th>Requires Approval</th></tr></thead>
                <tbody>
                  {equipment.map(e => {
                    const s = settings[e.id]
                    const bookable = s ? s.bookable : true
                    const requiresApproval = s?.requires_approval || false
                    return (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 500 }}>{e.nickname || e.equipment_name}</td>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
                            <input type="checkbox" checked={bookable} onChange={() => toggleBookable(e.id)} style={{ width: 'auto' }} />
                            <span style={{ color: bookable ? 'var(--accent)' : 'var(--text3)' }}>{bookable ? 'Yes' : 'No'}</span>
                          </label>
                        </td>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
                            <input type="checkbox" checked={requiresApproval} onChange={() => toggleRequireApproval(e.id)} style={{ width: 'auto' }} />
                            <span style={{ color: requiresApproval ? '#92400e' : 'var(--text3)' }}>{requiresApproval ? 'Yes' : 'No'}</span>
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Reference Photos */}
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>📸 Reference Photos (optional)</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
              Upload a reference photo per equipment. When lab users take before/after photos, this appears as a ghost overlay in the camera so they can align their shot. You can also add a short instruction (e.g., "Stand at the north end of the bench").
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {equipment.map(e => {
                const s = settings[e.id]
                const refUrl = s?.reference_photo_url || null
                const isUploading = uploadingRef === e.id
                return (
                  <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
                    <div style={{ height: 130, position: 'relative', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {refUrl
                        ? <img src={refUrl} alt="reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ fontSize: 28, opacity: 0.25 }}>📷</div>
                      }
                      {refUrl && (
                        <button onClick={() => clearReferencePhoto(e.id)}
                          style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
                          ✕ Remove
                        </button>
                      )}
                      {isUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="spinner" />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nickname || e.equipment_name}</div>
                      <input
                        type="file" accept="image/*"
                        ref={el => refFileRefs.current[e.id] = el}
                        style={{ display: 'none' }}
                        onChange={ev => { uploadReferencePhoto(e.id, ev.target.files[0]); ev.target.value = '' }}
                      />
                      <button className="btn btn-sm btn-primary" disabled={isUploading} onClick={() => refFileRefs.current[e.id]?.click()}>
                        {refUrl ? 'Replace photo' : 'Upload photo'}
                      </button>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={editingInstruction[e.id] || ''}
                          onChange={ev => setEditingInstruction(p => ({ ...p, [e.id]: ev.target.value }))}
                          placeholder="Photo instruction (optional)"
                          style={{ flex: 1, fontSize: 12 }}
                          maxLength={120}
                        />
                        <button className="btn btn-sm" onClick={() => saveInstruction(e.id)} style={{ whiteSpace: 'nowrap' }}>Save</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      }
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
export default function BookingEquipment() {
  const { session } = useAppStore()
  const [tab, setTab] = useState('calendar')

  const tabs = [
    { key: 'calendar', label: '📅 Book Equipment' },
    { key: 'history', label: '📋 History & Usage' },
    ...(isAdmin(session) ? [{ key: 'settings', label: '⚙️ Settings' }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Booking Equipment</div>
        <HelpPanel screen="booking" />
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {tab === 'calendar' && <BookingCalendar session={session} />}
      {tab === 'history' && <BookingHistory session={session} />}
      {tab === 'settings' && <BookingSettings session={session} />}
    </div>
  )
}
