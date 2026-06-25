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

// Convert any image URL to a PNG base64 string via canvas (for embedding in PDF/Excel)
async function imgUrlToBase64(url) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now() })
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    canvas.getContext('2d').drawImage(img, 0, 0, 300, 300)
    return canvas.toDataURL('image/png').split(',')[1]
  } catch { return null }
}

function ExportData() {
  const { toast, session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const loginMode = isSolo ? 'solo' : 'team'
  const orgId = session?.organizationId || null
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportTab, setExportTab] = useState('dates')
  const [selectedInspDate, setSelectedInspDate] = useState('')
  const [exportFormat, setExportFormat] = useState('excel')   // 'excel' | 'pdf'
  const [orgName, setOrgName] = useState('')
  const [orgLogoSrc, setOrgLogoSrc] = useState(null)

  const canDelete = session?.role === 'admin' || session?.role === 'user'

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!isSolo && orgId) {
      sb.from('organizations').select('name, logo_url').eq('id', orgId).single()
        .then(({ data: od }) => { setOrgName(od?.name || ''); setOrgLogoSrc(od?.logo_url || null) })
    }
  }, [orgId])

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

  // ── PDF: professional report for any set of room records ──
  async function exportPDF(roomRecords, fileTitle, reportTitle) {
    toast('Preparing PDF…')
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const PW = doc.internal.pageSize.getWidth()
    const PH = doc.internal.pageSize.getHeight()
    const ML = 14, MR = 14

    const labhiveB64 = await imgUrlToBase64(window.location.origin + '/labhive_logo.svg')
    const orgB64     = orgLogoSrc ? await imgUrlToBase64(orgLogoSrc) : null

    function drawHeader(isFirst) {
      if (labhiveB64) doc.addImage(labhiveB64, 'PNG', ML, 7, 18, 18)
      if (orgB64)     doc.addImage(orgB64,     'PNG', PW - MR - 36, 7, 36, 18)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(12, 17, 64)
      doc.text('SUPPLY INVENTORY INSPECTION REPORT', PW / 2, 14, { align: 'center' })
      if (isFirst && orgName) {
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
        doc.text(orgName, PW / 2, 20, { align: 'center' })
      }
      doc.setTextColor(0)
      doc.setDrawColor(29, 158, 117); doc.setLineWidth(0.8)
      doc.line(ML, 28, PW - MR, 28)
      return 33
    }

    let y = drawHeader(true)

    // Info block
    const allResults   = roomRecords.flatMap(r => r.results || [])
    const totalItems   = allResults.length
    const lowItems     = allResults.filter(i => i.low).length
    const okItems      = totalItems - lowItems
    const firstRec     = roomRecords[0]
    const reportDate   = firstRec
      ? new Date(firstRec.inspected_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : ''
    const inspector    = firstRec?.inspector || ''
    const C1 = ML, C2 = ML + 35, C3 = PW / 2 + 4, C4 = PW / 2 + 38
    const infoRows = [
      [['Organization:', orgName || '—'], ['Report to:', '________________________']],
      [['Date:', reportDate],              ['Items Inspected:', String(totalItems)]],
      [['Inspector:', inspector],          ['Items OK:', String(okItems)]],
      [['Title:', 'Lab Manager'],          ['Items Low:', String(lowItems)]],
    ]
    doc.setFontSize(9.5)
    infoRows.forEach(([L, R], i) => {
      const ry = y + i * 7
      doc.setFont('helvetica', 'bold'); doc.setTextColor(60)
      doc.text(L[0], C1, ry)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
      doc.text(L[1], C2, ry)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(60)
      doc.text(R[0], C3, ry)
      const isLow = R[0] === 'Items Low:'
      doc.setFont('helvetica', isLow && lowItems > 0 ? 'bold' : 'normal')
      doc.setTextColor(isLow && lowItems > 0 ? 180 : 0, 0, 0)
      doc.text(R[1], C4, ry)
      doc.setTextColor(0)
    })
    y += 34
    doc.setDrawColor(220); doc.setLineWidth(0.3); doc.line(ML, y, PW - MR, y); y += 5

    // Room sections
    for (const rec of roomRecords) {
      const timeStr = new Date(rec.inspected_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      if (y > PH - 55) { doc.addPage(); y = drawHeader(false) + 4 }

      doc.setFillColor(12, 17, 64)
      doc.rect(ML, y, PW - ML - MR, 7, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255)
      doc.text(`Room: ${rec.room_name}`, ML + 3, y + 5)
      doc.text(`${rec.inspector}  ·  ${timeStr}`, PW - MR - 2, y + 5, { align: 'right' })
      doc.setTextColor(0); y += 9

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [['#', 'Item Name', 'Unit', 'Count', 'Min', 'Status', 'To Order', 'Notes']],
        body: (rec.results || []).map((r, idx) => [
          idx + 1, r.name || '', r.unit || '', r.qty ?? '', r.min_qty ?? '',
          r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [29, 158, 117], textColor: [255,255,255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
        alternateRowStyles: { fillColor: [240, 250, 245] },
        columnStyles: {
          0: { cellWidth: 7,  halign: 'center' },
          1: { cellWidth: 44 },
          2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 13, halign: 'center' },
          4: { cellWidth: 12, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 'auto' },
        },
        willDrawCell: data => {
          if (data.section === 'body' && data.column.index === 5 && data.cell.raw === 'LOW') {
            data.cell.styles.fillColor = [254, 243, 199]
            data.cell.styles.textColor = [146, 64, 14]
            data.cell.styles.fontStyle = 'bold'
          }
        },
      })
      y = doc.lastAutoTable.finalY + 6
    }

    // Footer on every page
    const total = doc.internal.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
      doc.setPage(p)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150)
      doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(ML, PH - 12, PW - MR, PH - 12)
      doc.text(`Generated by LabHive  ·  ${new Date().toLocaleString()}`, ML, PH - 8)
      if (orgName) doc.text(orgName, PW / 2, PH - 8, { align: 'center' })
      doc.text(`Page ${p} of ${total}`, PW - MR, PH - 8, { align: 'right' })
      doc.setTextColor(0)
    }

    doc.save(`${fileTitle}.pdf`)
    toast('PDF exported!')
  }

  // ── Excel: all rooms stacked, with logos via ExcelJS ──
  async function exportExcel(rows, fileName, sheetTitle) {
    const { default: ExcelJS } = await import('exceljs')
    const wb  = new ExcelJS.Workbook()
    const ws  = wb.addWorksheet(sheetTitle.substring(0, 31))

    const labhiveB64 = await imgUrlToBase64(window.location.origin + '/labhive_logo.svg')
    const orgB64     = orgLogoSrc ? await imgUrlToBase64(orgLogoSrc) : null

    let dataStartRow = 1
    if (labhiveB64 || orgB64) {
      // 4-row logo header
      dataStartRow = 5
      ws.getRow(1).height = 15; ws.getRow(2).height = 40; ws.getRow(3).height = 15; ws.getRow(4).height = 8
      if (labhiveB64) {
        const id = wb.addImage({ base64: labhiveB64, extension: 'png' })
        ws.addImage(id, { tl: { col: 0, row: 0 }, br: { col: 1, row: 3 } })
      }
      if (orgB64) {
        const id = wb.addImage({ base64: orgB64, extension: 'png' })
        ws.addImage(id, { tl: { col: 5, row: 0 }, br: { col: 7, row: 3 } })
      }
      // Title centred in middle columns
      const titleCell = ws.getRow(2).getCell(3)
      titleCell.value = sheetTitle
      titleCell.font  = { bold: true, size: 14, color: { argb: 'FF0C1140' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.mergeCells(2, 3, 3, 5)
    }

    // Data rows
    rows.forEach((row, ri) => {
      const wsRow = ws.getRow(dataStartRow + ri)
      row.forEach((val, ci) => {
        const cell = wsRow.getCell(ci + 1)
        cell.value = val
        // Style room-header rows (single-cell rows)
        if (row.length === 1 && val) {
          cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C1140' } }
        }
        // Style column-header rows
        if (['Item', 'Item Name'].includes(String(val))) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D9E75' } }
        }
        if (String(val) === 'LOW') {
          cell.font = { bold: true, color: { argb: 'FF92400E' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
        }
      })
      wsRow.commit()
    })

    ws.columns = [
      { width: 36 }, { width: 10 }, { width: 10 },
      { width: 10 }, { width: 12 }, { width: 16 }, { width: 30 },
    ]

    const buf  = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = fileName + '.xlsx'; a.click()
    URL.revokeObjectURL(url)
    toast('Excel exported!')
  }

  // ── Single room export ──
  async function exportSingleRecord(rec) {
    const dateStr = new Date(rec.inspected_at).toLocaleDateString('en-CA')
    const timeStr = new Date(rec.inspected_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const safeRoom = rec.room_name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20)
    if (exportFormat === 'pdf') {
      await exportPDF([rec], `LabHive_${safeRoom}_${dateStr}`, `Inspection Report — ${rec.room_name}`)
    } else {
      const rows = []
      rows.push([`Inspection Report — ${rec.room_name}`])
      rows.push([`Date: ${dateStr}   Time: ${timeStr}`])
      rows.push([`Inspector: ${rec.inspector}`])
      rows.push([])
      rows.push([`ROOM: ${rec.room_name}  —  ${rec.inspector}  —  ${timeStr}`])
      rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
      ;(rec.results || []).forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
      await exportExcel(rows, `LabHive_${safeRoom}_${dateStr}`, rec.room_name.substring(0, 31))
    }
  }

  // ── Full day export ──
  async function exportByDate(dateStr) {
    if (!dateStr) { toast('Please select a date.'); return }
    toast('Loading…')
    let rq = sb.from('inspections').select('*').eq('login_mode', loginMode).order('inspected_at', { ascending: true })
    if (!isSolo) rq = rq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRecs } = await rq
    const dateRecs = (allRecs || []).filter(r => new Date(r.inspected_at).toLocaleDateString('en-CA') === dateStr)

    if (exportFormat === 'pdf') {
      await exportPDF(dateRecs, `LabHive_${dateStr}`, `Inspection Report — ${dateStr}`)
      return
    }

    let roomQ = sb.from('rooms').select('*').eq('login_mode', loginMode).order('name')
    if (!isSolo) roomQ = roomQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    let supQ  = sb.from('supplies').select('*').eq('login_mode', loginMode)
    if (!isSolo) supQ  = supQ.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRooms }    = await roomQ
    const { data: allSupplies } = await supQ
    const inspectedRoomNames    = new Set(dateRecs.map(r => r.room_name))
    const rows = []
    rows.push([`Inspection Report — ${dateStr}`])
    rows.push([`Exported: ${new Date().toLocaleString()}`])
    rows.push([])
    dateRecs.forEach(rec => {
      const d = new Date(rec.inspected_at)
      const t = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      rows.push([`ROOM: ${rec.room_name}  —  ${rec.inspector}  —  ${t}`])
      rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
      ;(rec.results || []).forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
      rows.push([])
    })
    ;(allRooms || []).forEach(room => {
      if (inspectedRoomNames.has(room.name)) return
      const items = (allSupplies || []).filter(s => s.room_id === room.id)
      if (!items.length) return
      rows.push([`ROOM: ${room.name}  —  NOT INSPECTED ON ${dateStr}`])
      rows.push(['Item', 'Unit', 'Current Min Qty', '', 'Status', 'Needs to Order', 'Notes'])
      items.forEach(s => rows.push([s.name, s.unit, s.min_qty, '', 'Not inspected', '', s.notes || '']))
      rows.push([])
    })
    await exportExcel(rows, `LabHive_${dateStr}`, dateStr.substring(0, 31))
  }

  // ── All-records export ──
  async function exportAll() {
    toast('Loading…')
    let aq = sb.from('inspections').select('*').eq('login_mode', loginMode).order('inspected_at', { ascending: true })
    if (!isSolo) aq = aq.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
    const { data: allRecs } = await aq
    if (!allRecs?.length) { toast('No records found.'); return }

    if (exportFormat === 'pdf') {
      await exportPDF(allRecs, `LabHive_AllRecords_${new Date().toLocaleDateString('en-CA')}`, 'All Inspection Records')
      return
    }

    // Excel: Summary sheet + one sheet per date
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const labhiveB64 = await imgUrlToBase64(window.location.origin + '/labhive_logo.svg')
    const orgB64     = orgLogoSrc ? await imgUrlToBase64(orgLogoSrc) : null

    function makeSheet(name) {
      const ws = wb.addWorksheet(name.substring(0, 31))
      if (labhiveB64 || orgB64) {
        ws.getRow(1).height = 15; ws.getRow(2).height = 40; ws.getRow(3).height = 15; ws.getRow(4).height = 8
        if (labhiveB64) { const id = wb.addImage({ base64: labhiveB64, extension: 'png' }); ws.addImage(id, { tl: { col: 0, row: 0 }, br: { col: 1, row: 3 } }) }
        if (orgB64)     { const id = wb.addImage({ base64: orgB64, extension: 'png' }); ws.addImage(id, { tl: { col: 5, row: 0 }, br: { col: 7, row: 3 } }) }
        const tc = ws.getRow(2).getCell(3); tc.value = name; tc.font = { bold: true, size: 13, color: { argb: 'FF0C1140' } }; tc.alignment = { horizontal: 'center', vertical: 'middle' }; ws.mergeCells(2, 3, 3, 5)
      }
      ws.columns = [{ width: 22 }, { width: 22 }, { width: 16 }, { width: 12 }, { width: 10 }, { width: 14 }]
      return { ws, dataStart: (labhiveB64 || orgB64) ? 5 : 1 }
    }

    // Summary sheet
    const { ws: sumWs, dataStart: sumStart } = makeSheet('All Inspections Summary')
    const sumRows = [
      ['Date & Time', 'Room', 'Inspector', 'Total Items', 'Low Items', 'Status'],
      ...allRecs.map(rec => {
        const d = new Date(rec.inspected_at)
        return [d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), rec.room_name, rec.inspector, (rec.results || []).length, rec.flag_count || 0, rec.flag_count > 0 ? 'Has low items' : 'All OK']
      }),
    ]
    sumRows.forEach((row, ri) => { const r = sumWs.getRow(sumStart + ri); row.forEach((v, ci) => { r.getCell(ci + 1).value = v }); r.commit() })

    // One sheet per date
    const byDate = {}
    allRecs.forEach(rec => { const d = new Date(rec.inspected_at).toLocaleDateString('en-CA'); if (!byDate[d]) byDate[d] = []; byDate[d].push(rec) })
    for (const [dateStr, recs] of Object.entries(byDate)) {
      const { ws, dataStart } = makeSheet(dateStr)
      const rows = []
      recs.forEach(rec => {
        const t = new Date(rec.inspected_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        rows.push([`ROOM: ${rec.room_name}  —  ${rec.inspector}  —  ${t}`])
        rows.push(['Item', 'Unit', 'Count', 'Min Qty', 'Status', 'Needs to Order', 'Notes'])
        ;(rec.results || []).forEach(r => rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'LOW' : 'OK', r.qty_needed || '', r.notes || '']))
        rows.push([])
      })
      rows.forEach((row, ri) => { const wsRow = ws.getRow(dataStart + ri); row.forEach((v, ci) => { wsRow.getCell(ci + 1).value = v }); wsRow.commit() })
      ws.columns = [{ width: 36 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 30 }]
    }

    const buf  = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `LabHive_AllRecords_${new Date().toLocaleDateString('en-CA')}.xlsx`; a.click(); URL.revokeObjectURL(url)
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
      {/* Sub-tabs + format toggle */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 0 }}>
        <button style={subTabStyle(exportTab === 'dates')} onClick={() => setExportTab('dates')}>📋 Inspection Dates</button>
        <button style={subTabStyle(exportTab === 'all')}   onClick={() => setExportTab('all')}>📊 All Records</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Format:</span>
          {[['excel', '📊 Excel'], ['pdf', '📄 PDF']].map(([fmt, label]) => (
            <button key={fmt} onClick={() => setExportFormat(fmt)}
              style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1.5px solid ${exportFormat === fmt ? 'var(--accent)' : 'var(--border)'}`, background: exportFormat === fmt ? 'var(--accent-light)' : 'var(--surface)', color: exportFormat === fmt ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.13s' }}>
              {label}
            </button>
          ))}
        </div>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {roomsForDate.length} room{roomsForDate.length !== 1 ? 's' : ''} inspected
                      </div>
                      <button className="btn btn-sm btn-primary" onClick={() => exportByDate(selectedInspDate)}>
                        {exportFormat === 'pdf' ? '📄' : '📊'} Download full day
                      </button>
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
                          <button className="btn btn-sm" title={`Download ${exportFormat === 'pdf' ? 'PDF' : 'Excel'} report`} style={{ flexShrink: 0 }}
                            onClick={() => exportSingleRecord(rec)}>{exportFormat === 'pdf' ? '📄' : '📊'}</button>
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

      {/* ── TAB 2: All Records ── */}
      {exportTab === 'all' && (
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
            Download one Excel file with all inspection records. Each date gets its own tab with all rooms stacked.
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
              <div>📋 <strong>Summary</strong> tab — overview of all inspections</div>
              <div>📅 <strong>One tab per date</strong> — all rooms stacked in each tab</div>
              <div>🔢 <strong>{data.length}</strong> total inspections across <strong>{uniqueDates.length}</strong> date{uniqueDates.length !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={exportAll}>
              {exportFormat === 'pdf' ? '📄' : '📊'} Download all records
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
            const [numVal, nameVal, minVal, qtyVal, unitVal] = row
            if (!nameVal || String(nameVal).trim() === '') continue
            const nameStr = String(nameVal).trim().toLowerCase()
            if (nameStr === 'item name' || nameStr === 'item') continue
            const numStr = String(numVal || '').trim().toLowerCase()
            if (numStr === 'no.' || numStr === 'no' || numStr === '#') continue
            if (isRoomHeader(numVal, nameVal)) { currentRoom = String(nameVal).trim(); if (!roomsData[currentRoom]) roomsData[currentRoom] = []; continue }
            const num = parseInt(numVal)
            if (!isNaN(num) && nameVal) {
              if (!currentRoom) { currentRoom = DEFAULT_ROOM_NAME; if (!roomsData[currentRoom]) roomsData[currentRoom] = [] }
              const unit = (unitVal && String(unitVal).trim()) ? String(unitVal).trim() : 'pcs'
              roomsData[currentRoom].push({ name: String(nameVal).trim(), unit, min_qty: parseFloat(minVal) || 1, qty: (qtyVal !== null && !isNaN(parseFloat(qtyVal))) ? parseFloat(qtyVal) : (parseFloat(minVal) || 1) })
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
    const EXAMPLES = [
      {
        room: 'Chemistry Lab',
        items: [
          ['Acetone (500 mL)', 5, 10, 'bottle'],
          ['Ethanol (1 L)', 3, 6, 'bottle'],
          ['Safety goggles', 10, 20, 'pair'],
        ],
      },
      {
        room: 'Storage Room',
        items: [
          ['Paper towels', 20, 40, 'roll'],
          ['Nitrile gloves (M)', 50, 100, 'pair'],
          ['First aid kit', 1, 2, 'set'],
        ],
      },
      {
        room: 'Equipment Room',
        items: [
          ['Safety helmet', 5, 10, 'piece'],
          ['Work gloves', 10, 20, 'pair'],
          ['Safety harness', 3, 6, 'piece'],
        ],
      },
    ]

    const rows = []
    // Title block
    rows.push(['LabHive — Supply Inventory Import Template'])
    rows.push(['Replace the example rooms and items below with your own data. Do not change column order.'])
    rows.push([])
    // Column headers
    rows.push(['No.', 'Item Name', 'Min Qty', 'Current Qty', 'Unit'])

    EXAMPLES.forEach(({ room, items }) => {
      rows.push(['', room, '', '', ''])
      items.forEach(([name, min, qty, unit], i) => rows.push([i + 1, name, min, qty, unit]))
      rows.push([])
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 8 }, { wch: 38 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]

    // Style every cell
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let R = range.s.r; R <= range.e.r; R++) {
      const rowData = rows[R]
      const isTitle   = R === 0
      const isSubtitle = R === 1
      const isColHdr  = R === 3
      const isBlank   = !rowData || rowData.every(c => c === '' || c == null)
      // Room header: col A is empty, col B is a non-empty string, col C empty
      const isRoomHdr = !isTitle && !isSubtitle && !isColHdr && !isBlank &&
                        (rowData[0] === '' || rowData[0] == null) &&
                        typeof rowData[1] === 'string' && rowData[1].trim() !== '' &&
                        (rowData[2] === '' || rowData[2] == null)

      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[addr]) ws[addr] = { v: '', t: 's' }
        if (isTitle) {
          ws[addr].s = { fill: { fgColor: { rgb: '0C1140' } }, font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'left', vertical: 'center' } }
        } else if (isSubtitle) {
          ws[addr].s = { fill: { fgColor: { rgb: 'E8ECF8' } }, font: { italic: true, sz: 10, color: { rgb: '3B4A7A' } }, alignment: { horizontal: 'left' } }
        } else if (isColHdr) {
          ws[addr].s = { fill: { fgColor: { rgb: 'BBDEFB' } }, font: { bold: true, color: { rgb: '0D47A1' } }, alignment: { horizontal: C >= 2 ? 'center' : 'left', vertical: 'center' } }
        } else if (isRoomHdr) {
          ws[addr].s = { fill: { fgColor: { rgb: '1D9E75' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'left', vertical: 'center' } }
        } else if (!isBlank) {
          // Example item rows — light yellow tint to signal "example"
          ws[addr].s = { fill: { fgColor: { rgb: 'FFFDE7' } }, font: { color: { rgb: '555555' } }, alignment: { horizontal: C >= 2 && C <= 3 ? 'center' : 'left' } }
        }
      }
    }

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },   // title spans all columns
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },   // subtitle spans all columns
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Import Template')
    XLSX.writeFile(wb, 'LabHive_Import_Template.xlsx')
    toast('Template downloaded!')
  }

  return (
    <div>
      {/* ── Step 1: Download template ── */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Step 1 — Download the import template</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.7 }}>
              Download the LabHive template, fill in your rooms and supplies, then upload it below.
              The file includes 3 example rooms to show the required format — replace them with your own data.
            </p>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['Col A', 'Item number (1, 2, 3…)'],
                ['Col B', 'Room name (header) or item name'],
                ['Col C', 'Minimum quantity'],
                ['Col D', 'Current quantity'],
                ['Col E', 'Unit (pcs, bottle, pair…)'],
              ].map(([col, desc]) => (
                <div key={col} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)' }}>
                  <strong style={{ color: 'var(--accent)' }}>{col}</strong> — {desc}
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={downloadTemplate}>
            📥 Download template
          </button>
        </div>
      </div>

      {/* ── Step 2: Upload and import ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Step 2 — Upload your completed file</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Existing rooms and supplies are <strong>kept</strong> — new items are added, existing items have their minimum quantity updated.
        </p>
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
    </div>
  )
}

function SettingsTab() {
  const { settings, refreshCache, toast, session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const orgId = session?.organizationId || null
  // Per-org key prefix: team users get org-scoped keys, solo users get a solo-scoped key
  const sfx = !isSolo && orgId ? `_${orgId}` : isSolo ? '_solo' : ''

  const getS = key => settings[`${key}${sfx}`] ?? settings[key] ?? null

  const [frequency, setFrequency] = useState(getS('reminder_frequency') || 'weekly')
  const [dueDay, setDueDay]       = useState(getS('due_day') || '5')
  const [customDays, setCustomDays] = useState(getS('custom_days') || '30')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await Promise.all([
      sb.from('settings').upsert({ key: `reminder_frequency${sfx}`, value: frequency }),
      sb.from('settings').upsert({ key: `due_day${sfx}`, value: String(dueDay) }),
      sb.from('settings').upsert({ key: `custom_days${sfx}`, value: String(customDays) }),
    ])
    await refreshCache()
    setSaving(false)
    toast('Reminder settings saved.')
  }

  const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  const ordinal = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

  return (
    <div>
      <div className="card">
        <div className="card-title">Inspection reminder</div>

        <div className="field">
          <label>Reminder frequency</label>
          <select value={frequency} onChange={e => { setFrequency(e.target.value); setDueDay(e.target.value === 'monthly' ? '1' : '5') }}>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="custom">Every X days (custom)</option>
          </select>
        </div>

        {frequency === 'weekly' && (
          <div className="field">
            <label>Inspection due on</label>
            <select value={dueDay} onChange={e => setDueDay(e.target.value)}>
              {WEEKDAYS.map((d, i) => <option key={d} value={(i + 1) % 7}>{d}</option>)}
            </select>
            <div className="text-muted" style={{ marginTop: 6 }}>Reminder banner appears the day before.</div>
          </div>
        )}

        {frequency === 'monthly' && (
          <div className="field">
            <label>Inspection due on day</label>
            <select value={dueDay} onChange={e => setDueDay(e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{ordinal(d)} of each month</option>
              ))}
            </select>
            <div className="text-muted" style={{ marginTop: 6 }}>Reminder banner appears the day before.</div>
          </div>
        )}

        {frequency === 'custom' && (
          <div className="field">
            <label>Inspect every</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="number" min={1} max={365} value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                style={{ width: 80, fontSize: 15, padding: '7px 10px' }} />
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>days</span>
            </div>
            <div className="text-muted" style={{ marginTop: 6 }}>
              Reminder shows when the interval is nearly due, based on the last inspection date.
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

export default function Home() {
  const { rooms, supplies, setScreen, setInspection, settings, toast, session, sidebarSubTab } = useAppStore()
  const subTab = sidebarSubTab || 'inspect'

  const isSolo = session?.loginMode === 'solo'
  const orgId  = session?.organizationId || null
  const sfx    = !isSolo && orgId ? `_${orgId}` : isSolo ? '_solo' : ''
  const getS   = key => settings[`${key}${sfx}`] ?? settings[key] ?? null

  const frequency         = getS('reminder_frequency') || 'weekly'
  const reminderDueDay    = parseInt(getS('due_day') || 5)
  const customIntervalDays = parseInt(getS('custom_days') || 30)

  const [lastInspDate, setLastInspDate] = useState(null)
  useEffect(() => {
    if (frequency !== 'custom') return
    let q = sb.from('inspections').select('inspected_at').order('inspected_at', { ascending: false }).limit(1)
    if (!isSolo && orgId) q = q.eq('organization_id', orgId)
    else if (isSolo && session?.userId) q = q.eq('solo_owner_id', session.userId)
    q.then(({ data }) => { if (data?.[0]) setLastInspDate(new Date(data[0].inspected_at)) })
  }, [frequency, orgId, isSolo, session?.userId])

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const ordinal = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')
  const now = new Date()
  let showReminder = false
  let reminderMsg  = ''

  if (frequency === 'weekly') {
    const dayBefore = (reminderDueDay - 1 + 7) % 7
    showReminder = now.getDay() === dayBefore
    reminderMsg  = `Supply inspection is due tomorrow (${DAYS[reminderDueDay]}). Please complete your inspection today.`
  } else if (frequency === 'monthly') {
    const todayDate    = now.getDate()
    const lastDayOfMth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const dayBefore    = reminderDueDay === 1 ? lastDayOfMth : reminderDueDay - 1
    showReminder = todayDate === dayBefore
    reminderMsg  = `Monthly inspection is due tomorrow (${ordinal(reminderDueDay)} of the month). Please complete your inspection today.`
  } else if (frequency === 'custom') {
    if (lastInspDate) {
      const daysSince = Math.floor((now - lastInspDate) / 86400000)
      showReminder = daysSince >= customIntervalDays - 1
      reminderMsg  = `Inspection is due — it has been ${daysSince} day${daysSince !== 1 ? 's' : ''} since the last one (schedule: every ${customIntervalDays} days).`
    }
  }

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
          {reminderMsg}
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
