import HelpPanel from '../../components/HelpPanel'
import ScrollTabs from '../../components/ScrollTabs'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'
import * as XLSX from 'xlsx-js-style'
import Modal from '../../components/Modal'

const ICONS = ['🧪','🔬','📦','🏥','🧬','💊','🩺','🧫','⚗️','🔭','🩻','🧰']
const ROOM_KEYWORDS = ['room','lab','highbay','high bay','bay','shed','office','tool','storage','corridor','hall','area']
const DEFAULT_ROOM_NAME = 'Janitor Room'
const UNIT_OPTIONS = ['%', 'Box', 'piece', 'pair', 'kg', 'L', 'pcs', 'set', 'roll', 'bag', 'bottle', 'case', 'barrel', 'pack']

// ── helper: build rows for one inspection record (all items, rooms stacked) ──
function buildRecordRows(rec, includeHeader = true) {
  const rows = []
  if (includeHeader) {
    const d = new Date(rec.inspected_at)
    rows.push(['ICT-Lab Inspection Report'])
    rows.push(['Date:', d.toLocaleString()])
    rows.push(['Inspector:', rec.inspector])
    rows.push([])
  }
  const byRoom = {}
  ;(rec.results || []).forEach(r => {
    const key = r.room_name || rec.room_name || 'Unknown Room'
    if (!byRoom[key]) byRoom[key] = []
    byRoom[key].push(r)
  })
  if (Object.keys(byRoom).length === 0 && rec.room_name) {
    byRoom[rec.room_name] = rec.results || []
  }
  Object.entries(byRoom).forEach(([roomName, items]) => {
    rows.push([`ROOM: ${roomName}${rec.inspector ? '  —  Inspector: ' + rec.inspector : ''}`])
    rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
    items.forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
    rows.push([])
  })
  return rows
}

// ── helper: style a worksheet — blue room rows, yellow LOW rows, centered data columns ──
function styleSheet(ws) {
  if (!ws['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])
  const NCOLS = 7
  const center = { horizontal: 'center', vertical: 'center' }

  for (let R = range.s.r; R <= range.e.r; R++) {
    const cellA = ws[XLSX.utils.encode_cell({ r: R, c: 0 })]
    const valA = String(cellA?.v || '')
    const cellE = ws[XLSX.utils.encode_cell({ r: R, c: 4 })]
    const valE = String(cellE?.v || '')
    const isRoomHdr = valA.startsWith('ROOM:')
    const isColHdr  = valA === 'Item'
    const isLow     = valE === 'LOW'

    for (let C = 0; C < NCOLS; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      if (!ws[addr]) ws[addr] = { v: '', t: 's' }
      const isCentered = C >= 1 && C <= 5

      if (isRoomHdr) {
        ws[addr].s = { fill: { fgColor: { rgb: '0D47A1' } }, font: { color: { rgb: 'FFFFFF' }, bold: true } }
      } else if (isColHdr) {
        ws[addr].s = { fill: { fgColor: { rgb: 'BBDEFB' } }, font: { bold: true, color: { rgb: '0D47A1' } }, alignment: center }
      } else if (isLow) {
        ws[addr].s = { fill: { fgColor: { rgb: 'FFF9C4' } }, font: { bold: true }, ...(isCentered && { alignment: center }) }
      } else if (isCentered && ws[addr].v !== '') {
        ws[addr].s = { alignment: center }
      }
    }
  }
}

function IconPicker({ selected, onSelect }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
      {ICONS.map(ic => (
        <button key={ic} type="button" onClick={() => onSelect(ic)}
          style={{ fontSize: 22, padding: 6, border: `2px solid ${ic === selected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
          {ic}
        </button>
      ))}
    </div>
  )
}

function RoomModal({ room, onClose, onSaved }) {
  const { toast, session } = useAppStore()
  const [name, setName] = useState(room?.name || '')
  const [icon, setIcon] = useState(room?.icon || '🧪')
  async function save() {
    if (!name.trim()) { toast('Please enter a room name.'); return }
    const loginMode = session?.loginMode === 'solo' ? 'solo' : 'team'
    const orgId = session?.organizationId || null
    if (room) await sb.from('rooms').update({ name, icon }).eq('id', room.id)
    else await sb.from('rooms').insert({ name, icon, login_mode: loginMode, organization_id: loginMode === 'team' ? orgId : null })
    toast('Room saved.'); onSaved(); onClose()
  }
  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{room ? 'Edit room' : 'Add room'}</div>
      <div className="field"><label>Room name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lab 201" autoFocus /></div>
      <div className="field"><label>Icon</label><IconPicker selected={icon} onSelect={setIcon} /></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>{room ? 'Save' : 'Add room'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function PhotoModal({ title, pathPrefix = '', onClose, onSaved }) {
  const { toast } = useAppStore()
  const [blob, setBlob] = useState(null)
  const [preview, setPreview] = useState(null)
  const [size, setSize] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function compress(file) {
    return new Promise(resolve => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => {
        const maxPx = 800, scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      }
      img.src = url
    })
  }

  async function handleFile(file) {
    if (!file?.type.startsWith('image/')) { toast('Please use an image file.'); return }
    const compressed = await compress(file)
    setBlob(compressed); setPreview(URL.createObjectURL(compressed)); setSize(Math.round(compressed.size / 1024))
  }

  async function upload() {
    if (!blob) { toast('Please select an image first.'); return }
    setUploading(true)
    try {
      const filename = `${pathPrefix}${Date.now()}.jpg`
      const { error } = await sb.storage.from('item-photos').upload(filename, blob, { contentType: 'image/jpeg', upsert: true })
      if (error) { toast(`Upload failed: ${error.message}`); setUploading(false); return }
      const { data } = sb.storage.from('item-photos').getPublicUrl(filename)
      onSaved(data.publicUrl); onClose(); toast('Photo saved!')
    } catch (e) { toast(`Upload failed: ${e.message || e}`) }
    setUploading(false)
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Upload photo</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>{title}</div>
      <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: 28, textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>Drag & drop image here</div>
        <label style={{ display: 'inline-block', padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: 'var(--surface)', marginTop: 8 }}>
          Browse file<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </label>
      </div>
      {preview && <div style={{ marginBottom: 16, textAlign: 'center' }}><img src={preview} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />{size && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Size: {size} KB</div>}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={upload} disabled={uploading}>{uploading ? 'Uploading…' : 'Save photo'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function RoomsTab() {
  const { rooms, supplies, refreshCache, toast } = useAppStore()
  const [roomModal, setRoomModal] = useState(null)
  const [photoModal, setPhotoModal] = useState(null)

  async function deleteRoom(id) {
    if (!confirm('Delete this room and all its supplies?')) return
    await sb.from('rooms').delete().eq('id', id)
    await refreshCache(); toast('Room deleted.')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-16">
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>Manage lab rooms</div>
        <button className="btn btn-sm btn-primary" onClick={() => setRoomModal('add')}>+ Add room</button>
      </div>
      {rooms.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}><div className="empty-icon">🏠</div>No rooms yet.</div>
      ) : rooms.map(r => {
        const cnt = supplies.filter(s => s.room_id === r.id).length
        return (
          <div key={r.id} className="card" style={{ padding: '14px 18px', marginBottom: 10 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-12">
                {r.photo_url ? <img src={r.photo_url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} /> : <span style={{ fontSize: 22 }}>{r.icon || '🧪'}</span>}
                <div><div style={{ fontWeight: 600 }}>{r.name}</div><div className="text-muted">{cnt} supplies</div></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setPhotoModal({ title: r.name, pathPrefix: `room_${r.id}_`, onSaved: async url => { await sb.from('rooms').update({ photo_url: url }).eq('id', r.id); await refreshCache() } })}>Photo</button>
                <button className="btn btn-sm" onClick={() => setRoomModal(r)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteRoom(r.id)}>Delete</button>
              </div>
            </div>
          </div>
        )
      })}
      {roomModal && <RoomModal room={roomModal === 'add' ? null : roomModal} onClose={() => setRoomModal(null)} onSaved={refreshCache} />}
      {photoModal && <PhotoModal title={photoModal.title} pathPrefix={photoModal.pathPrefix} onClose={() => setPhotoModal(null)} onSaved={photoModal.onSaved} />}
    </div>
  )
}

function SupplyModal({ supply, rooms, defaultRoomId, onClose, onSaved }) {
  const { toast, session } = useAppStore()
  const [form, setForm] = useState({
    room_id: supply?.room_id || defaultRoomId || rooms[0]?.id || '',
    name: supply?.name || '',
    unit: supply?.unit || '%',
    min_qty: supply?.min_qty ?? '',
    notes: supply?.notes || '',
    links: supply?.links || [],
  })

  function addLink() { setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] })) }
  function removeLink(i) { setForm(f => ({ ...f, links: f.links.filter((_, idx) => idx !== i) })) }
  function updateLink(i, field, val) { setForm(f => { const links = [...f.links]; links[i] = { ...links[i], [field]: val }; return { ...f, links } }) }

  async function save() {
    if (!form.name.trim() || !form.unit.trim()) { toast('Please fill all required fields.'); return }
    const loginMode = session?.loginMode === 'solo' ? 'solo' : 'team'
    const orgId = session?.organizationId || null
    const payload = { ...form, min_qty: parseFloat(form.min_qty) || 0, links: form.links.filter(l => l.url) }
    if (supply) await sb.from('supplies').update(payload).eq('id', supply.id)
    else await sb.from('supplies').insert({ ...payload, login_mode: loginMode, organization_id: loginMode === 'team' ? orgId : null })
    toast('Supply saved.'); onSaved(); onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{supply ? 'Edit supply' : 'Add supply'}</div>
      <div className="field"><label>Room</label>
        <select value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Supply name *</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nitrile Gloves (M)" />
      </div>
      <div className="grid-2">
        <div className="field"><label>Unit *</label>
          <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field"><label>Minimum qty</label>
          <input type="number" step="0.01" min="0" value={form.min_qty}
            onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} placeholder="e.g. 85.5" />
        </div>
      </div>
      <div className="field"><label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
      </div>
      <div className="field">
        <label>Purchase links</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {form.links.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input placeholder="Label" value={l.label} onChange={e => updateLink(i, 'label', e.target.value)} style={{ flex: 1 }} />
              <input placeholder="https://…" value={l.url} onChange={e => updateLink(i, 'url', e.target.value)} style={{ flex: 2 }} />
              <button onClick={() => removeLink(i)} style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', cursor: 'pointer', color: 'var(--accent2)', fontSize: 13 }}>✕</button>
            </div>
          ))}
        </div>
        <button className="btn btn-sm" type="button" onClick={addLink}>+ Add link</button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={save}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function SuppliesTab() {
  const { rooms, supplies, refreshCache, toast } = useAppStore()
  const [supplyModal, setSupplyModal] = useState(null)
  const [photoModal, setPhotoModal] = useState(null)
  const [roomFilter, setRoomFilter] = useState('')

  async function deleteSupply(id) {
    if (!confirm('Delete this supply?')) return
    await sb.from('supplies').delete().eq('id', id)
    await refreshCache(); toast('Supply deleted.')
  }

  const filtered = roomFilter ? supplies.filter(s => s.room_id === roomFilter) : supplies
  const byRoom = {}
  filtered.forEach(s => {
    const name = rooms.find(r => r.id === s.room_id)?.name || 'Unknown'
    if (!byRoom[name]) byRoom[name] = []
    byRoom[name].push(s)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-16">
        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">All rooms</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" onClick={() => setSupplyModal('add')}>+ Add supply</button>
      </div>
      {Object.keys(byRoom).length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}><div className="empty-icon">📦</div>No supplies yet.</div>
      ) : Object.entries(byRoom).map(([room, items]) => (
        <div key={room} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{room}</div>
          {items.map(s => (
            <div key={s.id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
              <div className="flex items-center justify-between">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {s.photo_url ? <img src={s.photo_url} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: 'var(--text3)' }}>📷</div>}
                  <div><div style={{ fontWeight: 500 }}>{s.name}</div><div className="text-muted">Min: {s.min_qty} {s.unit}</div></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setPhotoModal({ title: s.name, pathPrefix: `${s.id}_`, onSaved: async url => { await sb.from('supplies').update({ photo_url: url }).eq('id', s.id); await refreshCache() } })}>Photo</button>
                  <button className="btn btn-sm" onClick={() => setSupplyModal(s)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteSupply(s.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {supplyModal && <SupplyModal supply={supplyModal === 'add' ? null : supplyModal} rooms={rooms} defaultRoomId={roomFilter} onClose={() => setSupplyModal(null)} onSaved={refreshCache} />}
      {photoModal && <PhotoModal title={photoModal.title} pathPrefix={photoModal.pathPrefix} onClose={() => setPhotoModal(null)} onSaved={photoModal.onSaved} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EXPORT DATA TAB
// ══════════════════════════════════════════════════════════════
function ExportData() {
  const { toast, session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const loginMode = isSolo ? 'solo' : 'team'
  const orgId = session?.organizationId || null
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportTab, setExportTab] = useState('dates')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedInspDate, setSelectedInspDate] = useState('')

  const canDelete = session?.role === 'admin' || session?.role === 'user'

  useEffect(() => { load() }, [])

  async function load() {
    let q = sb.from('inspections').select('*').eq('login_mode', loginMode).order('inspected_at', { ascending: false }).limit(200)
    if (!isSolo) q = q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setData(data || []); setLoading(false)
  }

  async function deleteRecord(id) {
    if (!confirm('Delete this inspection record?')) return
    await sb.from('inspections').delete().eq('id', id)
    toast('Record deleted.')
    load()
  }

  async function viewRecord(id) {
    const { data } = await sb.from('inspections').select('*').eq('id', id).single()
    if (data) { useAppStore.getState().setLastRecord(data); useAppStore.getState().setScreen('results') }
  }

  // ── Export for a specific date: 1 tab, all rooms stacked ──
  async function exportByDate(dateStr) {
    if (!dateStr) { toast('Please select a date.'); return }
    toast('Loading…')
    let rq = sb.from('inspections').select('*').eq('login_mode', loginMode).order('inspected_at', { ascending: true })
    if (!isSolo) rq = rq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRecs } = await rq
    const dateRecs = (allRecs || []).filter(r => new Date(r.inspected_at).toLocaleDateString('en-CA') === dateStr)
    let roomQ = sb.from('rooms').select('*').eq('login_mode', loginMode).order('name')
    if (!isSolo) roomQ = roomQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    let supQ = sb.from('supplies').select('*').eq('login_mode', loginMode)
    if (!isSolo) supQ = supQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRooms } = await roomQ
    const { data: allSupplies } = await supQ

    const wb = XLSX.utils.book_new()
    const rows = []
    rows.push([`ICT-Lab Inspection Report — ${dateStr}`])
    rows.push([`Exported: ${new Date().toLocaleString()}`])
    rows.push([])

    const inspectedRoomNames = new Set(dateRecs.map(r => r.room_name))

    dateRecs.forEach(rec => {
      const d = new Date(rec.inspected_at)
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      rows.push([`ROOM: ${rec.room_name}  —  Inspector: ${rec.inspector}  —  ${timeStr}`])
      rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
      ;(rec.results || []).forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
      rows.push([])
    })

    ;(allRooms || []).forEach(room => {
      if (inspectedRoomNames.has(room.name)) return
      const roomSupplies = (allSupplies || []).filter(s => s.room_id === room.id)
      if (!roomSupplies.length) return
      rows.push([`ROOM: ${room.name}  —  NOT INSPECTED ON ${dateStr}`])
      rows.push(['Item', 'Unit', 'Current Min Qty', '', 'Status', 'Needs to Order', 'Notes'])
      roomSupplies.forEach(s => rows.push([s.name, s.unit, s.min_qty, '', 'Not inspected', '', s.notes || '']))
      rows.push([])
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 30 }]
    styleSheet(ws)
    XLSX.utils.book_append_sheet(wb, ws, dateStr.substring(0, 31))
    XLSX.writeFile(wb, `ICT-Lab_${dateStr}.xlsx`)
    toast('Exported!')
  }

  // ── All-time export: Summary tab + 1 tab per date ──
  async function exportAll() {
    toast('Loading…')
    let aq = sb.from('inspections').select('*').eq('login_mode', loginMode).order('inspected_at', { ascending: true })
    if (!isSolo) aq = aq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRecs } = await aq
    if (!allRecs?.length) { toast('No records found.'); return }

    const wb = XLSX.utils.book_new()

    const sumRows = [
      ['ICT-Lab — All Inspection Records'],
      ['Exported:', new Date().toLocaleString()],
      ['Total inspections:', allRecs.length],
      [],
      ['Date', 'Room', 'Inspector', 'Total Items', 'Low Items', 'Status']
    ]
    allRecs.forEach(rec => {
      const d = new Date(rec.inspected_at)
      sumRows.push([
        d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        rec.room_name, rec.inspector,
        (rec.results || []).length,
        rec.flag_count || 0,
        rec.flag_count > 0 ? 'Has low items' : 'All OK'
      ])
    })
    const sumWs = XLSX.utils.aoa_to_sheet(sumRows)
    sumWs['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, sumWs, 'Summary')

    const byDate = {}
    allRecs.forEach(rec => {
      const dateStr = new Date(rec.inspected_at).toLocaleDateString('en-CA')
      if (!byDate[dateStr]) byDate[dateStr] = []
      byDate[dateStr].push(rec)
    })

    Object.entries(byDate).forEach(([dateStr, recs]) => {
      const rows = []
      rows.push([`ICT-Lab — ${dateStr} — All Rooms`])
      rows.push([])
      recs.forEach(rec => {
        const d = new Date(rec.inspected_at)
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        rows.push([`ROOM: ${rec.room_name}  —  Inspector: ${rec.inspector}  —  ${timeStr}`])
        rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
        ;(rec.results || []).forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
        rows.push([])
      })
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 30 }]
      styleSheet(ws)
      XLSX.utils.book_append_sheet(wb, ws, dateStr.substring(0, 31))
    })

    XLSX.writeFile(wb, `ICT-Lab_AllRecords_${new Date().toLocaleDateString('en-CA')}.xlsx`)
    toast(`Exported ${allRecs.length} inspections!`)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  // Unique dates newest-first for the Inspection Dates dropdown
  const uniqueDates = [...new Set(data.map(r => new Date(r.inspected_at).toLocaleDateString('en-CA')))].sort((a, b) => b.localeCompare(a))
  // Rooms inspected on the selected date
  const roomsForDate = selectedInspDate ? data.filter(r => new Date(r.inspected_at).toLocaleDateString('en-CA') === selectedInspDate) : []

  const subTabStyle = (active) => ({
    padding: '8px 18px', border: 'none', background: 'transparent',
    fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: active ? 'var(--accent)' : 'var(--text2)',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    whiteSpace: 'nowrap', transition: 'all 0.15s'
  })

  return (
    <div>
      {/* 3 sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={subTabStyle(exportTab === 'dates')}    onClick={() => setExportTab('dates')}>📋 Inspection Dates</button>
        <button style={subTabStyle(exportTab === 'specific')} onClick={() => setExportTab('specific')}>📅 Specific Date</button>
        <button style={subTabStyle(exportTab === 'all')}      onClick={() => setExportTab('all')}>📊 All Records</button>
      </div>

      {/* ── TAB 1: Inspection Dates ── */}
      {exportTab === 'dates' && (
        <div>
          {data.length === 0
            ? <div className="empty-state"><div className="empty-icon">📋</div>No inspections yet.</div>
            : (
              <>
                {/* Date dropdown */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 6 }}>
                    {data.length} inspection{data.length !== 1 ? 's' : ''} across {uniqueDates.length} date{uniqueDates.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ position: 'relative', maxWidth: 360 }}>
                    <select
                      value={selectedInspDate}
                      onChange={e => setSelectedInspDate(e.target.value)}
                      style={{ width: '100%', appearance: 'none', padding: '10px 36px 10px 14px', borderRadius: 10, border: `2px solid ${selectedInspDate ? 'var(--accent)' : 'var(--border)'}`, background: selectedInspDate ? 'var(--accent-light)' : 'var(--surface)', color: selectedInspDate ? 'var(--accent)' : 'var(--text2)', fontSize: 14, fontWeight: selectedInspDate ? 600 : 400, cursor: 'pointer', outline: 'none' }}>
                      <option value="">— Select an inspection date —</option>
                      {uniqueDates.map(d => {
                        const count = data.filter(r => new Date(r.inspected_at).toLocaleDateString('en-CA') === d).length
                        const label = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                        return <option key={d} value={d}>{label} — {count} room{count !== 1 ? 's' : ''}</option>
                      })}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, pointerEvents: 'none', color: 'var(--text3)' }}>▾</span>
                  </div>
                </div>

                {/* Rooms for selected date */}
                {!selectedInspDate && (
                  <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text3)', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>☝</div>
                    <div style={{ fontSize: 14 }}>Select a date above to see the rooms inspected that day</div>
                  </div>
                )}
                {selectedInspDate && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      {roomsForDate.length} room{roomsForDate.length !== 1 ? 's' : ''} inspected
                    </div>
                    {roomsForDate.map((rec, i) => (
                      <div key={rec.id}
                        style={{ background: i % 2 === 0 ? 'var(--surface)' : '#f0f7ff', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => viewRecord(rec.id)}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{rec.room_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                            {new Date(rec.inspected_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {rec.inspector}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {rec.flag_count > 0
                            ? <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>{rec.flag_count} low</span>
                            : <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>All OK</span>}
                          <button className="btn btn-sm" title="Export this date" style={{ flexShrink: 0 }}
                            onClick={() => exportByDate(selectedInspDate)}>📥</button>
                          {canDelete && (
                            <button className="btn btn-sm btn-danger" title="Delete record" style={{ flexShrink: 0 }}
                              onClick={() => deleteRecord(rec.id)}>🗑️</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          }
        </div>
      )}

      {/* ── TAB 2: Specific Date ── */}
      {exportTab === 'specific' && (
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
            Select a date to download the full inspection report for all rooms on that day.
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div className="field">
              <label>Select inspection date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={new Date().toLocaleDateString('en-CA')}
                style={{ fontSize: 15 }}
              />
            </div>
            {selectedDate && !inspectionDates.includes(selectedDate) && (
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                ⚠️ No inspections recorded on this date. The report will show current supply quantities for all rooms marked as "Not inspected".
              </div>
            )}
            {selectedDate && inspectionDates.includes(selectedDate) && (
              <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12, padding: '8px 12px', background: 'var(--accent-light)', borderRadius: 8 }}>
                ✓ Inspections found for this date.
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={!selectedDate}
              onClick={() => exportByDate(selectedDate)}>
              📥 Download report for {selectedDate || '…'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: All Records ── */}
      {exportTab === 'all' && (
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
            Download one Excel file with all inspection records. Each date gets its own tab with all rooms stacked.
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
              <div>📋 <strong>Summary</strong> tab — overview of all inspections</div>
              <div>📅 <strong>One tab per date</strong> — all rooms stacked in each tab</div>
              <div>🔢 <strong>{data.length}</strong> total inspections across <strong>{Object.keys(months).length}</strong> month{Object.keys(months).length !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={exportAll}>
              📊 Download all records
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ImportTab() {
  const { rooms, supplies, refreshCache, toast, session } = useAppStore()
  const [importData, setImportData] = useState(null)
  const [importing, setImporting] = useState(false)

  function isRoomHeader(numVal, nameVal) {
    if (numVal !== null && numVal !== undefined && numVal !== '') return false
    if (!nameVal || typeof nameVal !== 'string') return false
    const n = nameVal.trim().toLowerCase()
    if (!n) return false
    const skip = ['item', 'no.', 'item name', 'min qty', 'safety box', 'safety items', 'front cabinet', 'air tanks', 'mixing station', 'autoextractor', 'auto extractor', 'storage area']
    if (skip.some(w => n === w || n.startsWith(w))) return false
    return ROOM_KEYWORDS.some(k => n.includes(k)) || (nameVal.trim() === nameVal.trim().toUpperCase() && nameVal.trim().split(/\s+/).length >= 2)
  }

  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
          const roomsData = {}; let currentRoom = null
          for (const row of rows) {
            const [numVal, nameVal, minVal, qtyVal] = row
            if (!nameVal || String(nameVal).trim() === '') continue
            const nameStr = String(nameVal).trim().toLowerCase()
            if (nameStr === 'item name' || nameStr === 'item') continue
            const numStr = String(numVal || '').trim().toLowerCase()
            if (numStr === 'no.' || numStr === 'no' || numStr === '#') continue
            if (isRoomHeader(numVal, nameVal)) { currentRoom = String(nameVal).trim(); if (!roomsData[currentRoom]) roomsData[currentRoom] = []; continue }
            const num = parseInt(numVal)
            if (!isNaN(num) && nameVal) {
              if (!currentRoom) { currentRoom = DEFAULT_ROOM_NAME; if (!roomsData[currentRoom]) roomsData[currentRoom] = [] }
              roomsData[currentRoom].push({ name: String(nameVal).trim(), unit: 'pcs', min_qty: parseFloat(minVal) || 1, qty: (qtyVal !== null && !isNaN(parseFloat(qtyVal))) ? parseFloat(qtyVal) : (parseFloat(minVal) || 1) })
            }
          }
          resolve(roomsData)
        } catch (err) { reject(err) }
      }
      reader.onerror = reject; reader.readAsBinaryString(file)
    })
  }

  async function confirmImport() {
    if (!importData) return
    setImporting(true)
    const loginMode = session?.loginMode === 'solo' ? 'solo' : 'team'
    const orgId = session?.organizationId || null
    try {
      let rq = sb.from('rooms').select('*').eq('login_mode', loginMode)
      if (loginMode === 'team') rq = rq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      let sq = sb.from('supplies').select('*').eq('login_mode', loginMode)
      if (loginMode === 'team') sq = sq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      const { data: existingRooms } = await rq
      const { data: existingSupplies } = await sq
      const roomByName = {}; (existingRooms || []).forEach(r => roomByName[r.name.toLowerCase()] = r)
      const supplyKey = (roomId, name) => `${roomId}::${name.toLowerCase()}`
      const supplyByKey = {}; (existingSupplies || []).forEach(s => supplyByKey[supplyKey(s.room_id, s.name)] = s)
      const roomNames = Object.keys(importData); let added = 0, updated = 0
      for (let i = 0; i < roomNames.length; i++) {
        const name = roomNames[i]; let roomId
        const existing = roomByName[name.toLowerCase()]
        if (existing) { roomId = existing.id }
        else { const { data: newRoom } = await sb.from('rooms').insert({ name, icon: ICONS[i % ICONS.length], login_mode: loginMode, organization_id: loginMode === 'team' ? orgId : null }).select().single(); if (!newRoom) continue; roomId = newRoom.id }
        for (const s of importData[name]) {
          const key = supplyKey(roomId, s.name)
          if (supplyByKey[key]) { await sb.from('supplies').update({ min_qty: s.min_qty, qty: s.qty }).eq('id', supplyByKey[key].id); updated++ }
          else { await sb.from('supplies').insert({ room_id: roomId, name: s.name, unit: s.unit, min_qty: s.min_qty, qty: s.qty, login_mode: loginMode, organization_id: loginMode === 'team' ? orgId : null }); added++ }
        }
      }
      setImportData(null); await refreshCache(); toast(`Import done: ${added} added, ${updated} updated.`)
    } catch (e) { toast('Import failed.') }
    setImporting(false)
  }

  function downloadTemplate() {
    const data = [['Item No.', 'Item Name', 'Min Qty', 'Unit']]
    rooms.forEach(r => { data.push(['', r.name, '', '']); supplies.filter(s => s.room_id === r.id).forEach((s, i) => data.push([i + 1, s.name, s.min_qty, s.unit])); data.push(['', '', '', '']) })
    const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 15 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventory'); XLSX.writeFile(wb, 'ICT-Lab_template.xlsx')
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Import from Excel</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Upload an Excel file to add rooms and supplies. Existing data is <strong>kept</strong> — new items are added, existing items have their minimum quantity updated.</p>
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
          <strong>Expected format:</strong> Column A = item number, Column B = item name. Room names appear as header rows. Column C = Min Qty (optional).
        </div>
        <div className="field">
          <label>Select Excel file (.xlsx)</label>
          <input type="file" accept=".xlsx" onChange={async e => { if (!e.target.files[0]) return; try { setImportData(await parseExcelFile(e.target.files[0])) } catch { toast('Error reading file.') } }} style={{ padding: 8 }} />
        </div>
        {importData && (
          <>
            <div className="divider" />
            <div className="card-title" style={{ marginTop: 8 }}>Preview</div>
            <div style={{ marginBottom: 12, fontSize: 14 }}>Found <strong>{Object.keys(importData).length} rooms</strong> and <strong>{Object.values(importData).reduce((a, b) => a + b.length, 0)} items</strong>.</div>
            {Object.entries(importData).map(([room, items]) => (
              <div key={room} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', padding: '4px 0' }}>{room} <span style={{ fontWeight: 400 }}>({items.length} items)</span></div>
                {items.slice(0, 3).map((s, i) => <div key={i} style={{ fontSize: 13, padding: '3px 0', color: 'var(--text2)' }}>· {s.name} <span style={{ color: 'var(--text3)' }}>min: {s.min_qty}</span></div>)}
                {items.length > 3 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>…and {items.length - 3} more</div>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={confirmImport} disabled={importing}>{importing ? 'Importing…' : 'Import now'}</button>
              <button className="btn" onClick={() => setImportData(null)}>Cancel</button>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <div className="card-title">Download template</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>Download a template with your current items.</p>
        <button className="btn btn-sm" onClick={downloadTemplate}>Download template</button>
      </div>
    </div>
  )
}

function SettingsTab() {
  const { settings, refreshCache, toast } = useAppStore()

  async function saveDueDay(val) {
    await sb.from('settings').upsert({ key: 'due_day', value: val })
    await refreshCache(); toast('Reminder day saved.')
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Weekly reminder</div>
        <div className="field">
          <label>Inspection due day</label>
          <select defaultValue={settings['due_day'] || '5'} onChange={e => saveDueDay(e.target.value)}>
            {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d, i) => (
              <option key={d} value={(i + 1) % 7}>{d}</option>
            ))}
          </select>
        </div>
        <div className="text-muted">Users see a reminder banner the day before this day.</div>
      </div>
      <div className="card">
        <div className="card-title">Account & password</div>
        <div className="text-muted">To change your password or email, go to your <strong>Profile</strong> page.</div>
      </div>
    </div>
  )
}

export default function Home() {
  const { rooms, supplies, setScreen, setInspection, settings, toast, session, sidebarSubTab } = useAppStore()
  const subTab = sidebarSubTab || 'inspect'

  const today = new Date().getDay()
  const due = parseInt(settings['due_day'] || 5)
  const dayBefore = (due - 1 + 7) % 7
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const showReminder = today === dayBefore

  function startInspection(roomId) {
    const room = rooms.find(r => r.id === roomId)
    const items = supplies.filter(s => s.room_id === roomId)
    if (!items.length) { toast('No supplies in this room. Ask admin to add items.'); return }
    setInspection({ roomId, room, items, index: 0, results: [] })
    setScreen('inspection')
  }

  const isAdmin = session?.role === 'admin'

  return (
    <div>
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="section-title">Supply Inventory</div><HelpPanel screen="home" /></div>
      </div>

      {showReminder && (
        <div style={{ background: 'var(--warn-light)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#92400e' }}>
          <span style={{ fontSize: 16 }}>🔔</span>
          Reminder: Supply inventory is due tomorrow ({days[due]}). Please complete your inspection today.
        </div>
      )}

      {subTab === 'inspect' && (
        <div>
          {rooms.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🏠</div>No rooms yet. Go to Rooms tab to add rooms.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
              {rooms.map(r => {
                const cnt = supplies.filter(s => s.room_id === r.id).length
                return (
                  <div key={r.id} className="room-card" onClick={() => startInspection(r.id)}
                    style={{ width: 160, flexShrink: 0, ...(r.photo_url ? { paddingTop: 0, overflow: 'hidden' } : {}) }}>
                    {r.photo_url ? <img src={r.photo_url} style={{ width: 'calc(100% + 32px)', height: 90, objectFit: 'cover', borderRadius: '10px 10px 0 0', margin: '-20px -16px 12px' }} /> : <div style={{ fontSize: 28, marginBottom: 8 }}>{r.icon || '🧪'}</div>}
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{cnt} item{cnt !== 1 ? 's' : ''}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {subTab === 'export'   && <ExportData />}
      {subTab === 'rooms'    && <RoomsTab />}
      {subTab === 'supplies' && <SuppliesTab />}
      {subTab === 'import'   && <ImportTab />}
      {subTab === 'settings' && <SettingsTab />}
    </div>
  )
}
