import HelpPanel from '../../components/HelpPanel'
import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import * as XLSX from 'xlsx'
import ScrollTabs from '../../components/ScrollTabs'

const CATEGORIES = [
  'Aggregate Testing Equipment',
  'Asphalt Binder Testing Equipment',
  'Asphalt Mixtures Testing Equipment',
  'General Testing Equipment',
  'Other',
]

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Out of Service']

const LOCATIONS = [
  'Binder Lab', 'High Bay A', 'High Bay B', 'High Bay C',
  'MPF - Saw Room', 'MPF - Sieve', 'MPF - Soil',
  'Servo Room', 'Shed', 'Soils Lab', 'Storage', 'Volumetric Lab', 'Other',
]

function canEdit(session) { return session?.role === 'admin' || session?.role === 'user' }

function EquipmentModal({ item, onClose, onSaved, session, soloCats = [] }) {
  const { toast } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const blank = {
    equipment_name: '', nickname: '', location: '', category: '',
    ref_id: '', model_number: '', serial_number: '', manufacturer: '',
    date_received: '', condition: 'Good', notes: '', out_of_service: false,
    maintenance_interval_days: '', last_maintenance_date: '', next_maintenance_date: '',
  }
  const [form, setForm] = useState(item ? {
    equipment_name: item.equipment_name || '',
    nickname: item.nickname || '',
    location: item.location || '',
    category: item.category || '',
    ref_id: item.ref_id || '',
    model_number: item.model_number || '',
    serial_number: item.serial_number || '',
    manufacturer: item.manufacturer || '',
    date_received: item.date_received || '',
    condition: item.condition || 'Good',
    notes: item.notes || '',
    out_of_service: item.out_of_service || false,
    maintenance_interval_days: item.maintenance_interval_days || '',
    last_maintenance_date: item.last_maintenance_date || '',
    next_maintenance_date: item.next_maintenance_date || '',
  } : blank)
  const [saving, setSaving] = useState(false)

  function calcNextMaintenance(lastDate, intervalDays) {
    if (!lastDate || !intervalDays) return ''
    const d = new Date(lastDate)
    d.setDate(d.getDate() + parseInt(intervalDays))
    return d.toISOString().split('T')[0]
  }

  async function save() {
    if (!form.equipment_name.trim()) { toast('Equipment name is required.'); return }
    setSaving(true)
    const payload = {
      ...form,
      out_of_service: form.out_of_service || false,
      date_received: form.date_received || null,
      maintenance_interval_days: form.maintenance_interval_days ? parseInt(form.maintenance_interval_days) : null,
      last_maintenance_date: form.last_maintenance_date || null,
      next_maintenance_date: form.next_maintenance_date || calcNextMaintenance(form.last_maintenance_date, form.maintenance_interval_days) || null,
      updated_at: new Date().toISOString(),
    }
    if (item) {
      await sb.from('equipment_inventory').update(payload).eq('id', item.id)
    } else {
      const lm = session?.loginMode === 'solo' ? 'solo' : 'team'
      await sb.from('equipment_inventory').insert({ ...payload, login_mode: lm, organization_id: lm === 'team' ? (session?.organizationId || null) : null, solo_owner_id: lm === 'solo' ? (session?.userId || null) : null })
    }
    toast('Equipment saved.')
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 640, border: '1px solid var(--border)', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{item ? 'Edit equipment' : 'Add equipment'}</div>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Basic Info</div>
          <div className="grid-2">
            <div className="field"><label>Equipment Name *</label><input value={form.equipment_name} onChange={e => setForm(f => ({ ...f, equipment_name: e.target.value }))} placeholder="e.g. Gyratory Compactor" autoFocus /></div>
            <div className="field"><label>Nickname / ID</label><input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="e.g. Servopac" /></div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Category</label>
              {isSolo
                ? soloCats.length === 0
                  ? <div style={{ fontSize: 13, color: '#92400e', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px' }}>
                      No categories yet — open the <strong>Equipment Hub</strong> icon and go to the <strong>Categories</strong> tab to create them first.
                    </div>
                  : <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">— Select —</option>
                      {soloCats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                : <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">— Select —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              }
            </div>
            <div className="field"><label>Location</label>
              {isSolo
                ? <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Bench A, Storage Room…" />
                : <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                    <option value="">— Select —</option>
                    {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
              }
            </div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Manufacturer</label><input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
            <div className="field"><label>Model Number</label><input value={form.model_number} onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))} /></div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Serial Number</label><input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
            <div className="field"><label>Ref ID</label><input value={form.ref_id} onChange={e => setForm(f => ({ ...f, ref_id: e.target.value }))} /></div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Date Received</label><input type="date" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} /></div>
            <div className="field"><label>Condition</label>
              <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Out of Service */}
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
              <input type="checkbox" checked={form.out_of_service || false}
                onChange={e => setForm(f => ({ ...f, out_of_service: e.target.checked }))}
                style={{ width: 'auto' }} />
              <span style={{ color: form.out_of_service ? 'var(--accent2)' : 'var(--text2)', fontWeight: 500 }}>
                ⛔ Mark as Out of Service
              </span>
            </label>
            {form.out_of_service && <div style={{ fontSize: 12, color: 'var(--accent2)', marginTop: 4 }}>This equipment will be flagged in the equipment list and cannot be booked.</div>}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 12px' }}>Maintenance</div>
          <div className="grid-2">
            <div className="field"><label>Interval (days)</label><input type="number" value={form.maintenance_interval_days} onChange={e => {
              const interval = e.target.value
              const next = calcNextMaintenance(form.last_maintenance_date, interval)
              setForm(f => ({ ...f, maintenance_interval_days: interval, next_maintenance_date: next }))
            }} placeholder="e.g. 365" /></div>
            <div className="field"><label>Last Maintenance</label><input type="date" value={form.last_maintenance_date} onChange={e => {
              const last = e.target.value
              const next = calcNextMaintenance(last, form.maintenance_interval_days)
              setForm(f => ({ ...f, last_maintenance_date: last, next_maintenance_date: next }))
            }} /></div>
          </div>
          <div className="field">
            <label>Next Maintenance (auto-calculated)</label>
            <input type="date" value={form.next_maintenance_date} onChange={e => setForm(f => ({ ...f, next_maintenance_date: e.target.value }))} />
          </div>

          <div className="field"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EquipmentList({ session }) {
  const { toast } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterLoc, setFilterLoc] = useState('')
  const [filterCond, setFilterCond] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [soloCats, setSoloCats] = useState([])
  const fileRef = useRef(null)

  useEffect(() => {
    load()
    if (isSolo && session?.userId) {
      sb.from('settings').select('value').eq('key', `solo_eq_cats_${session.userId}`).maybeSingle()
        .then(({ data }) => { try { setSoloCats(JSON.parse(data?.value || '[]')) } catch { setSoloCats([]) } })
    }
  }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('equipment_inventory').select('*').eq('is_active', true).eq('login_mode', isSolo ? 'solo' : 'team').order('category').order('equipment_name')
    if (isSolo) q = q.eq('solo_owner_id', session?.userId || '00000000-0000-0000-0000-000000000000')
    else q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setItems(data || [])
    setLoading(false)
  }

  async function deleteItem(id) {
    if (!confirm('Delete this equipment?')) return
    await sb.from('equipment_inventory').update({ is_active: false }).eq('id', id)
    load(); toast('Equipment removed.')
  }

  async function parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
          const headers = rows[0]?.map(h => (h || '').toString().toLowerCase().trim()) || []
          const items = []
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row || row.every(c => !c)) continue
            const get = (...keys) => {
              for (const k of keys) {
                const idx = headers.findIndex(h => h.includes(k))
                if (idx >= 0 && row[idx]) return row[idx].toString().trim()
              }
              return ''
            }
            const name = get('equipment name', 'equipment')
            if (!name) continue
            let dateReceived = null
            const dateRaw = get('date received', 'date')
            if (dateRaw) {
              const d = new Date(dateRaw)
              if (!isNaN(d)) dateReceived = d.toISOString().split('T')[0]
            }
            const locRaw = get('location')
            const locNorm = Object.entries({
              'Binder Lab': ['binder lab', 'binder'],
              'High Bay A': ['high bay a'],
              'High Bay B': ['high bay b'],
              'High Bay C': ['high bay c'],
              'MPF - Saw Room': ['mpf - saw', 'mpf-saw', 'saw room'],
              'MPF - Sieve': ['mpf - sieve', 'mpf-sieve', 'sieve'],
              'MPF - Soil': ['mpf - soil', 'mpf-soil'],
              'Servo Room': ['servo'],
              'Shed': ['shed'],
              'Soils Lab': ['soil'],
              'Storage': ['storage'],
              'Volumetric Lab': ['volumetric'],
            }).find(([, patterns]) => patterns.some(p => locRaw.toLowerCase().includes(p)))?.[0] || locRaw

            items.push({
              equipment_name: name,
              nickname: get('nickname'),
              location: locNorm,
              category: get('category'),
              ref_id: get('ref id', 'ref'),
              model_number: get('model number', 'model'),
              serial_number: get('serial number', 'serial'),
              manufacturer: get('manufacturer'),
              date_received: dateReceived,
              condition: 'Good',
              out_of_service: false,
            })
          }
          resolve(items)
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsBinaryString(file)
    })
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    let added = 0
    for (const item of importPreview) {
      const { error } = await sb.from('equipment_inventory').insert({ ...item, is_active: true })
      if (!error) added++
    }
    setImportPreview(null)
    load()
    toast(`${added} equipment items imported.`)
    setImporting(false)
  }

  function exportToExcel() {
    const data = [
      ['#', 'Equipment Name', 'Nickname', 'Location', 'Category', 'Ref ID', 'Model Number', 'Serial Number', 'Manufacturer', 'Date Received', 'Condition', 'Out of Service', 'Notes'],
      ...filtered.map((i, idx) => [idx + 1, i.equipment_name, i.nickname, i.location, i.category, i.ref_id, i.model_number, i.serial_number, i.manufacturer, i.date_received, i.condition, i.out_of_service ? 'Yes' : 'No', i.notes])
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Equipment')
    XLSX.writeFile(wb, `ICT_Equipment_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !q || [i.equipment_name, i.nickname, i.manufacturer, i.serial_number, i.model_number].some(f => f?.toLowerCase().includes(q))
    const matchCat = !filterCat || i.category === filterCat
    const matchLoc = !filterLoc || i.location === filterLoc
    const matchCond = !filterCond || i.condition === filterCond
    return matchSearch && matchCat && matchLoc && matchCond
  })

  const grouped = {}
  filtered.forEach(i => {
    const cat = i.category || 'Uncategorized'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(i)
  })

  const condColor = { Good: '#1e4d39', Fair: '#92400e', Poor: '#c84b2f', 'Out of Service': '#a32d2d' }
  const condBg = { Good: '#e8f2ee', Fair: '#fef3c7', Poor: '#fdf0ed', 'Out of Service': '#fcebeb' }

  // Running counter across all groups
  let rowNum = 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search equipment…" style={{ flex: 1, minWidth: 180 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {(isSolo
            ? [...new Set(items.map(i => i.category).filter(Boolean))].sort()
            : CATEGORIES
          ).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All locations</option>
          {[...new Set(items.map(i => i.location).filter(Boolean))].sort().map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterCond} onChange={e => setFilterCond(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {canEdit(session) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-primary" onClick={() => { setEditItem(null); setShowModal(true) }}>+ Add equipment</button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={importing}>⬆️ Import Excel</button>
          <button className="btn btn-sm" onClick={exportToExcel}>📊 Export Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={async e => {
            try { setImportPreview(await parseExcel(e.target.files[0])); e.target.value = '' }
            catch { toast('Error reading file.') }
          }} />
        </div>
      )}

      {importPreview && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Import preview — {importPreview.length} items</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            First 5 items: {importPreview.slice(0, 5).map(i => i.equipment_name).join(', ')}{importPreview.length > 5 ? '…' : ''}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={confirmImport} disabled={importing}>{importing ? 'Importing…' : 'Import now'}</button>
            <button className="btn btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, padding: '10px 0', marginBottom: 12, fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
        <span><strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> items shown</span>
        <span><strong style={{ color: 'var(--text)' }}>{items.length}</strong> total</span>
        {items.filter(i => i.out_of_service).length > 0 && (
          <span style={{ color: 'var(--accent2)' }}>⛔ <strong>{items.filter(i => i.out_of_service).length}</strong> out of service</span>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🔧</div>No equipment found.</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0', borderBottom: '1px solid var(--border)', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span>{cat}</span>
              <span style={{ fontWeight: 400 }}>{catItems.length} items</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: 13, minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Equipment Name</th>
                    <th>Nickname</th>
                    <th>Location</th>
                    <th>Manufacturer</th>
                    <th>Serial #</th>
                    <th>Date Received</th>
                    <th>Condition</th>
                    {canEdit(session) && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {catItems.map((item) => {
                    rowNum++
                    return (
                      <tr key={item.id} style={{ opacity: item.out_of_service ? 0.6 : 1 }}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>{rowNum}</td>
                        <td style={{ fontWeight: 500 }}>
                          {item.out_of_service && (
                            <span style={{ marginRight: 6, fontSize: 10, background: '#fcebeb', color: '#a32d2d', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>OUT OF SERVICE</span>
                          )}
                          {item.equipment_name}
                        </td>
                        <td style={{ color: 'var(--text2)' }}>{item.nickname || '—'}</td>
                        <td style={{ color: 'var(--text2)' }}>{item.location || '—'}</td>
                        <td style={{ color: 'var(--text2)' }}>{item.manufacturer || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.serial_number || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.date_received || '—'}</td>
                        <td>
                          <span style={{ background: condBg[item.condition] || '#f0efe9', color: condColor[item.condition] || '#555', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                            {item.condition || 'Good'}
                          </span>
                        </td>
                        {canEdit(session) && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { setEditItem(item); setShowModal(true) }}>Edit</button>
                              <button className="btn btn-sm btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => deleteItem(item.id)}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showModal && (
        <EquipmentModal
          item={editItem}
          session={session}
          soloCats={soloCats}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={load}
        />
      )}
    </div>
  )
}

function CalibrationTab({ session }) {
  const { toast } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const docRef = useRef()
  const sopRef = useRef()

  const orgId = session?.loginMode !== 'solo' && session?.userId ? session.organizationId : null
  const EMPTY_FORM = { manufacturer_certificate: '', start_date: '', interval_months: '', next_due_date: '', calibration_document_url: '', calibration_sop_url: '', notes: '' }

  useEffect(() => { load() }, [session?.organizationId])

  async function load() {
    setLoading(true)
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname, category, location').eq('is_active', true).order('category').order('equipment_name')
    if (orgId) eqQ = eqQ.eq('organization_id', orgId)
    let calQ = sb.from('equipment_calibration').select('*').order('start_date', { ascending: false })
    if (orgId) calQ = calQ.eq('organization_id', orgId)
    const [{ data: eqData }, { data: calData }] = await Promise.all([eqQ, calQ])
    setEquipment(eqData || [])
    setRecords(calData || [])
    setLoading(false)
  }

  function getHistory(equipmentId) {
    return records.filter(r => r.equipment_id === equipmentId)
  }

  function getLatestRecord(equipmentId) {
    return getHistory(equipmentId)[0] || null
  }

  function getStatus(record) {
    if (!record?.next_due_date) return 'none'
    const days = Math.ceil((new Date(record.next_due_date) - new Date()) / 86400000)
    if (days < 0) return 'overdue'
    if (days <= 30) return 'soon'
    return 'ok'
  }

  function calcNextDue(startDate, intervalMonths) {
    if (!startDate || !intervalMonths) return ''
    const d = new Date(startDate + 'T00:00:00')
    d.setMonth(d.getMonth() + parseInt(intervalMonths))
    return d.toISOString().split('T')[0]
  }

  function openModal(eq) {
    const history = getHistory(eq.id)
    setModal({
      equipmentId: eq.id,
      equipmentName: eq.nickname ? `${eq.equipment_name} (${eq.nickname})` : eq.equipment_name,
      showForm: history.length === 0,
      form: { ...EMPTY_FORM },
    })
  }

  async function refreshModalHistory(equipmentId) {
    const { data } = await sb.from('equipment_calibration').select('*').eq('equipment_id', equipmentId).order('start_date', { ascending: false })
    setRecords(prev => [...prev.filter(r => r.equipment_id !== equipmentId), ...(data || [])])
  }

  async function uploadFile(file, type, equipmentId) {
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `calibration/${orgId || 'solo'}/${equipmentId}/${type}-${Date.now()}.${ext}`
    const { error } = await sb.storage.from('project-files').upload(path, file, { contentType: file.type })
    if (error) throw new Error(error.message)
    return sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
  }

  async function save() {
    const f = modal.form
    if (!f.start_date) { toast('Please enter the calibration date.'); return }
    if (!f.interval_months) { toast('Please enter the calibration interval in months.'); return }
    setSaving(true)
    try {
      let docUrl = f.calibration_document_url
      let sopUrl = f.calibration_sop_url
      if (docRef.current?.files[0]) docUrl = await uploadFile(docRef.current.files[0], 'doc', modal.equipmentId)
      if (sopRef.current?.files[0]) sopUrl = await uploadFile(sopRef.current.files[0], 'sop', modal.equipmentId)
      const { error } = await sb.from('equipment_calibration').insert({
        equipment_id: modal.equipmentId,
        organization_id: orgId,
        manufacturer_certificate: f.manufacturer_certificate || null,
        start_date: f.start_date,
        interval_months: parseInt(f.interval_months),
        next_due_date: f.next_due_date || calcNextDue(f.start_date, f.interval_months),
        calibration_document_url: docUrl || null,
        calibration_sop_url: sopUrl || null,
        notes: f.notes || null,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      toast('Calibration record added ✓')
      if (docRef.current) docRef.current.value = ''
      if (sopRef.current) sopRef.current.value = ''
      await refreshModalHistory(modal.equipmentId)
      setModal(m => ({ ...m, showForm: false, form: { ...EMPTY_FORM } }))
    } catch (e) {
      toast('Save failed: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(id, equipmentId) {
    if (!confirm('Delete this calibration record? This cannot be undone.')) return
    await sb.from('equipment_calibration').delete().eq('id', id)
    const remaining = records.filter(r => r.equipment_id === equipmentId && r.id !== id)
    setRecords(prev => prev.filter(r => r.id !== id))
    if (remaining.length === 0) setModal(m => ({ ...m, showForm: true }))
    toast('Record deleted.')
  }

  const BADGE = {
    none:    { label: 'Not Set',  color: '#666',    bg: '#f0f0f0' },
    overdue: { label: 'Overdue',  color: '#c0392b', bg: '#fdecea' },
    soon:    { label: 'Due Soon', color: '#e67e22', bg: '#fef3e2' },
    ok:      { label: 'Current',  color: '#27ae60', bg: '#eafaf1' },
  }

  if (loading) return <div className="spinner" style={{ margin: '40px auto' }} />

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
        Track calibration schedules, certificates and SOP documents for lab equipment. Each calibration event is saved as a separate record — full history is always accessible.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['Equipment', 'Certificate #', 'Last Calibrated', 'Interval', 'Next Due', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipment.map(eq => {
              const rec = getLatestRecord(eq.id)
              const history = getHistory(eq.id)
              const status = getStatus(rec)
              const badge = BADGE[status]
              return (
                <tr key={eq.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ fontWeight: 600 }}>{eq.equipment_name}</div>
                    {eq.nickname && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{eq.nickname}</div>}
                    {eq.category && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{eq.category}</div>}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--mono)', fontSize: 12, color: rec?.manufacturer_certificate ? 'var(--text)' : 'var(--text3)' }}>
                    {rec?.manufacturer_certificate || '—'}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{rec?.start_date || '—'}</td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{rec?.interval_months ? `${rec.interval_months} mo` : '—'}</td>
                  <td style={{ padding: '10px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{rec?.next_due_date || '—'}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, whiteSpace: 'nowrap' }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => openModal(eq)}>
                      {history.length > 0 ? `Records (${history.length})` : 'Set Up'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {equipment.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
                No equipment found. Add equipment in the List of Equipment tab first.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 560, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Calibration Records</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
              {modal.equipmentName}
            </div>

            {!modal.showForm && (
              <button className="btn btn-primary" style={{ marginBottom: 20 }}
                onClick={() => setModal(m => ({ ...m, showForm: true, form: { ...EMPTY_FORM } }))}>
                + Add New Calibration
              </button>
            )}

            {modal.showForm && (
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 16, marginBottom: 20, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>New Calibration Entry</div>
                <div className="field">
                  <label>Manufacturer Certificate #</label>
                  <input type="text" placeholder="e.g. NIST-2024-00123" value={modal.form.manufacturer_certificate}
                    onChange={e => setModal(m => ({ ...m, form: { ...m.form, manufacturer_certificate: e.target.value } }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Calibration Date *</label>
                    <input type="date" value={modal.form.start_date} onChange={e => {
                      const next = calcNextDue(e.target.value, modal.form.interval_months)
                      setModal(m => ({ ...m, form: { ...m.form, start_date: e.target.value, next_due_date: next || m.form.next_due_date } }))
                    }} />
                  </div>
                  <div className="field">
                    <label>Interval (months) *</label>
                    <input type="number" min="1" placeholder="e.g. 12" value={modal.form.interval_months} onChange={e => {
                      const next = calcNextDue(modal.form.start_date, e.target.value)
                      setModal(m => ({ ...m, form: { ...m.form, interval_months: e.target.value, next_due_date: next || m.form.next_due_date } }))
                    }} />
                  </div>
                </div>
                <div className="field">
                  <label>Next Calibration Due (auto-calculated, editable)</label>
                  <input type="date" value={modal.form.next_due_date}
                    onChange={e => setModal(m => ({ ...m, form: { ...m.form, next_due_date: e.target.value } }))} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 8px' }}>Documents</div>
                <div className="field">
                  <label>Calibration Certificate / Document</label>
                  <input type="file" ref={docRef} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ fontSize: 12 }} />
                </div>
                <div className="field">
                  <label>Calibration SOP</label>
                  <input type="file" ref={sopRef} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ fontSize: 12 }} />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea rows={2} placeholder="Additional calibration notes..." value={modal.form.notes}
                    onChange={e => setModal(m => ({ ...m, form: { ...m.form, notes: e.target.value } }))} style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button>
                  {getHistory(modal.equipmentId).length > 0 && (
                    <button className="btn" onClick={() => setModal(m => ({ ...m, showForm: false }))}>Cancel</button>
                  )}
                </div>
              </div>
            )}

            {getHistory(modal.equipmentId).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Calibration History
                </div>
                {getHistory(modal.equipmentId).map((rec, i) => {
                  const status = getStatus(rec)
                  const badge = BADGE[status]
                  return (
                    <div key={rec.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 10, position: 'relative' }}>
                      {i === 0 && <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, color: '#27ae60', background: '#eafaf1', padding: '1px 6px', borderRadius: 8 }}>LATEST</span>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 13, marginBottom: 8, paddingRight: 60 }}>
                        <span><span style={{ color: 'var(--text3)', fontSize: 11 }}>Date </span><span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{rec.start_date || '—'}</span></span>
                        <span><span style={{ color: 'var(--text3)', fontSize: 11 }}>Cert # </span><span style={{ fontFamily: 'var(--mono)' }}>{rec.manufacturer_certificate || '—'}</span></span>
                        <span><span style={{ color: 'var(--text3)', fontSize: 11 }}>Interval </span><span style={{ fontFamily: 'var(--mono)' }}>{rec.interval_months ? `${rec.interval_months} mo` : '—'}</span></span>
                        <span><span style={{ color: 'var(--text3)', fontSize: 11 }}>Next Due </span><span style={{ fontFamily: 'var(--mono)' }}>{rec.next_due_date || '—'}</span></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg }}>{badge.label}</span>
                        {rec.calibration_document_url && <a href={rec.calibration_document_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>📄 Certificate</a>}
                        {rec.calibration_sop_url && <a href={rec.calibration_sop_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>📄 SOP</a>}
                        <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                          onClick={() => deleteRecord(rec.id, modal.equipmentId)}>Delete</button>
                      </div>
                      {rec.notes && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{rec.notes}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoriesManager({ toast, session }) {
  const [categories, setCategories] = useState([])
  const [newCat, setNewCat] = useState('')
  const [loading, setLoading] = useState(true)
  const orgId = session?.userId ? session?.organizationId : null
  useEffect(() => { loadCats() }, [])
  async function loadCats() {
    setLoading(true)
    let q = sb.from('equipment_categories').select('*').order('name')
    if (orgId) q = q.eq('organization_id', orgId)
    const { data } = await q
    setCategories(data || []); setLoading(false)
  }
  async function addCategory() {
    if (!newCat.trim()) return
    await sb.from('equipment_categories').insert({ name: newCat.trim(), organization_id: orgId || null })
    setNewCat(''); loadCats(); toast('Category added.')
  }
  async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return
    await sb.from('equipment_categories').delete().eq('id', id)
    loadCats(); toast('Category deleted.')
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Categories</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Add or remove equipment categories.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="New category name…" style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={addCategory}>Add</button>
      </div>
      {loading ? <div className="spinner" style={{ margin: '0 auto' }} /> : categories.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            {c.name}
          </div>
          <button className="btn btn-sm btn-danger" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => deleteCategory(c.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}

function EquipmentSettings({ session }) {
  const { toast } = useAppStore()
  const [defaultInterval, setDefaultInterval] = useState('365')
  const [saving, setSaving] = useState(false)
  async function applyDefaultInterval() {
    if (!confirm(`Set maintenance interval to ${defaultInterval} days for all equipment without one?`)) return
    setSaving(true)
    let q = sb.from('equipment_inventory').update({ maintenance_interval_days: parseInt(defaultInterval) }).is('maintenance_interval_days', null).eq('is_active', true)
    if (session?.organizationId && session?.userId) q = q.eq('organization_id', session.organizationId)
    await q
    toast('Default interval applied.'); setSaving(false)
  }
  async function clearAllMaintenance() {
    if (!confirm('Clear all maintenance schedules? This cannot be undone.')) return
    let q = sb.from('equipment_inventory').update({ maintenance_interval_days: null, last_maintenance_date: null, next_maintenance_date: null }).eq('is_active', true)
    if (session?.organizationId && session?.userId) q = q.eq('organization_id', session.organizationId)
    await q
    toast('Maintenance schedules cleared.')
  }
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Default maintenance interval</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Apply a default interval to all equipment without one set.</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={defaultInterval} onChange={e => setDefaultInterval(e.target.value)} style={{ width: 'auto' }}>
            <option value="90">Every 90 days</option>
            <option value="180">Every 6 months</option>
            <option value="365">Every year</option>
            <option value="730">Every 2 years</option>
          </select>
          <button className="btn btn-sm btn-primary" onClick={applyDefaultInterval} disabled={saving}>Apply to equipment without interval</button>
        </div>
      </div>
      {session?.loginMode !== 'solo' && <CategoriesManager toast={toast} session={session} />}
      {session?.role === 'admin' && (
        <div className="card" style={{ borderColor: 'var(--accent2)' }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: 'var(--accent2)' }}>Danger zone</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>These actions cannot be undone.</div>
          <button className="btn btn-sm btn-danger" onClick={clearAllMaintenance}>Clear all maintenance schedules</button>
        </div>
      )}
    </div>
  )
}

function MaintenanceRecords({ session }) {
  const { toast } = useAppStore()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [usageMap, setUsageMap] = useState({})
  const [editHours, setEditHours] = useState(null)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState([])
  const [assignModal, setAssignModal] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const orgId = !isSolo && session?.userId ? session?.organizationId : null
    let eqQ = sb.from('equipment_inventory').select('id, equipment_name, nickname, location, category, last_maintenance_date, max_usage_hours, usage_hours_since_maintenance, condition, assigned_to, out_of_service').eq('is_active', true).order('category').order('equipment_name')
    let staffQ = sb.from('users').select('id, name').in('role', ['user', 'admin']).eq('is_active', true).order('name')
    if (orgId) { eqQ = eqQ.eq('organization_id', orgId); staffQ = staffQ.eq('organization_id', orgId) }
    const [{ data: eq }, { data: bookings }, { data: staffData }] = await Promise.all([
      eqQ,
      sb.from('equipment_bookings').select('equipment_id, start_time, end_time, status').eq('status', 'confirmed'),
      staffQ,
    ])
    setStaff(staffData || [])
    const usage = {}
    ;(bookings || []).forEach(b => {
      const hrs = (new Date(b.end_time) - new Date(b.start_time)) / 3600000
      usage[b.equipment_id] = (usage[b.equipment_id] || 0) + hrs
    })
    setItems(eq || []); setUsageMap(usage); setLoading(false)
  }

  async function assignMaintenance() {
    if (!assignModal) return
    setSaving(true)
    await sb.from('equipment_inventory').update({ assigned_to: assignModal.assigned_to || null, updated_at: new Date().toISOString() }).eq('id', assignModal.id)
    toast('Maintenance assigned ✓'); setSaving(false); setAssignModal(null); load()
  }

  async function saveMaxHours() {
    if (!editHours) return
    setSaving(true)
    await sb.from('equipment_inventory').update({ max_usage_hours: editHours.max_usage_hours || null, usage_hours_since_maintenance: editHours.usage_hours_since_maintenance || 0, updated_at: new Date().toISOString() }).eq('id', editHours.id)
    toast('Usage threshold saved ✓'); setSaving(false); setEditHours(null); load()
  }

  async function resetUsage(id) {
    if (!confirm('Reset usage hours to 0?')) return
    await sb.from('equipment_inventory').update({ usage_hours_since_maintenance: 0, last_maintenance_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', id)
    toast('Usage reset ✓'); load()
  }

  function getUsageStatus(item, totalHrs) {
    const max = item.max_usage_hours
    if (!max) return null
    const pct = (totalHrs / max) * 100
    if (pct >= 100) return { label: 'Exceeded', color: '#a32d2d', bg: '#fcebeb', pct: 100 }
    if (pct >= 80) return { label: `${Math.round(pct)}%`, color: '#92400e', bg: '#fef3c7', pct }
    return { label: `${Math.round(pct)}%`, color: '#1e4d39', bg: '#e8f2ee', pct }
  }

  const grouped = {}
  items.forEach(i => { const cat = i.category || 'Uncategorized'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(i) })

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Tracks equipment usage hours based on confirmed bookings. Set a maximum usage threshold — when exceeded, equipment appears in Maintenance Due.</div>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0', borderBottom: '1px solid var(--border)', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span>{cat}</span><span style={{ fontWeight: 400 }}>{catItems.length} items</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Equipment</th><th>Location</th><th>Total Usage</th><th>Since Last</th><th>Max Threshold</th><th>Usage Bar</th><th>Assigned To</th><th>Last Maint.</th>
                    {canEdit(session) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {catItems.map(item => {
                    const totalHrs = Math.round((usageMap[item.id] || 0) * 10) / 10
                    const sinceHrs = Math.round((item.usage_hours_since_maintenance || 0) * 10) / 10
                    const status = getUsageStatus(item, totalHrs)
                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 500 }}>
                          {item.out_of_service && <span style={{ marginRight: 4, fontSize: 10, background: '#fcebeb', color: '#a32d2d', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>OOS</span>}
                          {item.nickname || item.equipment_name}
                        </td>
                        <td style={{ color: 'var(--text2)' }}>{item.location || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--accent)' }}>{totalHrs}h</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{sinceHrs}h</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{item.max_usage_hours ? `${item.max_usage_hours}h` : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                        <td style={{ minWidth: 120 }}>
                          {status ? (
                            <div>
                              <span style={{ fontSize: 11, color: status.color, fontWeight: 600 }}>{status.label}</span>
                              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden', marginTop: 3 }}>
                                <div style={{ height: '100%', width: `${Math.min(100, status.pct)}%`, background: status.color, borderRadius: 99 }} />
                              </div>
                            </div>
                          ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>No threshold</span>}
                        </td>
                        <td>{item.assigned_to ? <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{item.assigned_to}</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.last_maintenance_date || '—'}</td>
                        {canEdit(session) && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setEditHours({ id: item.id, name: item.nickname || item.equipment_name, max_usage_hours: item.max_usage_hours || '', usage_hours_since_maintenance: item.usage_hours_since_maintenance || 0 })}>⚙️ Set</button>
                              <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setAssignModal({ id: item.id, name: item.nickname || item.equipment_name, assigned_to: item.assigned_to || '' })}>👤</button>
                              <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => resetUsage(item.id)}>↺</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      }

      {assignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Assign maintenance</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>{assignModal.name}</div>
            <div className="field">
              <label>Assign to staff member</label>
              <select value={assignModal.assigned_to} onChange={e => setAssignModal(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={assignMaintenance} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn" onClick={() => setAssignModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editHours && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Set usage threshold</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>{editHours.name}</div>
            <div className="field">
              <label>Maximum usage hours before maintenance</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" value={editHours.max_usage_hours} onChange={e => setEditHours(f => ({ ...f, max_usage_hours: e.target.value }))} placeholder="e.g. 100" style={{ width: 120 }} />
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>hours</span>
              </div>
            </div>
            <div className="field">
              <label>Current hours since last maintenance</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" value={editHours.usage_hours_since_maintenance} onChange={e => setEditHours(f => ({ ...f, usage_hours_since_maintenance: e.target.value }))} style={{ width: 120 }} />
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>hours</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveMaxHours} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn" onClick={() => setEditHours(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EquipmentInventory() {
  const { session } = useAppStore()
  const [tab, setTab] = useState('list')

  const tabs = [
    { key: 'list', label: '📋 List of Equipment' },
    ...(canEdit(session) ? [{ key: 'calibration', label: '🧪 Calibration' }] : []),
    ...(canEdit(session) ? [{ key: 'records', label: '📊 Maintenance Records' }] : []),
    { key: 'settings', label: '⚙️ Settings' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Equipment List</div>
        <HelpPanel screen="equipment" />
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {tab === 'list'        && <EquipmentList session={session} />}
      {tab === 'calibration' && <CalibrationTab session={session} />}
      {tab === 'records'     && <MaintenanceRecords session={session} />}
      {tab === 'settings'    && <EquipmentSettings session={session} />}
    </div>
  )
}
