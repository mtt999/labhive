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
function BookingModal({ booking, equipmentList, selectedEquipment, session, onSave, onClose, initialSlot }) {
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
      await sb.from('equipment_bookings').insert(payload)
      toast(requiresApproval ? 'Booking submitted — pending approval.' : 'Booking confirmed ✓')
      if (!requiresApproval) {
        const eqName = equipmentList.find(e => e.id === form.equipment_id)?.nickname || 'equipment'
        const when = fmtDateTime(form.start_time)
        await sendBookingEmail(
          session.userId,
          'booking_confirmed',
          `Booking confirmed — ${eqName}`,
          `Your booking is confirmed`,
          `Your booking for ${eqName} on ${when} has been confirmed. See you then!`
        )
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

            {/* Bookings — render segment for this day */}
            {bookings.map(b => {
              const seg = getBookingSegment(b, di)
              if (!seg) return null
              const br = [
                seg.isStart ? '4px' : '0',
                seg.isEnd ? '4px' : '0',
                seg.isEnd ? '4px' : '0',
                seg.isStart ? '4px' : '0',
              ].join(' ')
              return (
                <div key={`${b.id}-${di}`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onBookingClick(b) }}
                  style={{ position: 'absolute', top: seg.top + 1, left: 2, right: 2, height: seg.height, background: statusBg[b.status], border: `1px solid ${statusColor[b.status]}50`, borderLeft: `3px solid ${statusColor[b.status]}`, borderRadius: br, padding: '2px 5px', fontSize: 10, overflow: 'hidden', zIndex: 2, cursor: 'pointer' }}>
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
            })}
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

// ── Booking Detail Modal ──────────────────────────────────────
function BookingDetail({ booking, equipment, session, onEdit, onDelete, onDeny, onClose, onApprove }) {
  const [denyReason, setDenyReason] = useState('')
  const [showDenyForm, setShowDenyForm] = useState(false)

  const eq = equipment
  const isOwn = booking.user_id === session.userId || booking.user_name === session.username

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 440, width: '100%', border: '1px solid var(--border)' }}>
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

  const [retrainingBlocked, setRetrainingBlocked] = useState([]) // equipment IDs blocked for this user
  const orgEqIdsRef = useRef(null) // null = unscoped (solo/super admin), [] = org with no equipment, [...] = org equipment IDs

  async function loadEquipment() {
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('equipment_inventory').select('id, equipment_name, nickname, category, location').eq('is_active', true).eq('login_mode', isSolo ? 'solo' : 'team').order('category').order('nickname')
    if (!isSolo && session?.organizationId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setEquipment(data || [])
    if (!isSolo && session?.userId && session?.organizationId) {
      orgEqIdsRef.current = (data || []).map(e => e.id)
    }
    setLoading(false)
    loadBookings()
    // Check retraining blocks for this user
    await checkRetrainingStatus(data || [])
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
    let query = sb.from('equipment_bookings').select('*')
      .gte('start_time', start).lt('start_time', end)
      .order('start_time')
    if (selectedEq.length > 0) {
      query = query.in('equipment_id', selectedEq)
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
      {notifications.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {notifications.map(n => (
            <div key={n.id} style={{ background: n.type === 'denied' ? '#fcebeb' : '#e8f2ee', border: `1px solid ${n.type === 'denied' ? '#f09595' : '#9FE1CB'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
              <span style={{ color: n.type === 'denied' ? '#a32d2d' : '#1e4d39' }}>{n.type === 'denied' ? '✕' : '✓'} {n.message}</span>
              <button onClick={() => dismissNotification(n.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>✕</button>
            </div>
          ))}
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
          onSave={loadBookings}
          onClose={() => { setShowBookingModal(false); setBookingDraft(null); setEditBooking(null) }}
          initialSlot={bookingDraft}
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
      ? sb.from('equipment_bookings').select('*').order('start_time', { ascending: false }).limit(1000)
      : sb.from('equipment_bookings').select('*').eq('user_id', session.userId).order('start_time', { ascending: false })
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
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const orgId = !isSolo && session?.userId ? session?.organizationId : null
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname').eq('is_active', true).order('nickname')
    let uQ = sb.from('users').select('id, name, role').eq('is_active', true).neq('role', 'admin').order('name')
    if (orgId) { eqQ = eqQ.eq('organization_id', orgId); uQ = uQ.eq('organization_id', orgId) }
    const [{ data: eq }, { data: s }, { data: u }] = await Promise.all([
      eqQ,
      sb.from('equipment_booking_settings').select('*'),
      uQ,
    ])
    setEquipment(eq || [])
    const map = {}; (s || []).forEach(r => map[r.equipment_id] = r); setSettings(map)
    setUsers(u || [])
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

  if (!isAdmin(session)) return <div className="empty-state"><div className="empty-icon">🔒</div>Admin only.</div>

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Equipment Booking Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Control which equipment can be booked and whether approval is required.</div>
      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : (
          <div style={{ overflowX: 'auto' }}>
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
