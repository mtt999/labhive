import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import jsQR from 'jsqr'

const TYPE_LABELS = { aggregate: 'Aggregate', asphalt_binder: 'Asphalt Binder', plant_mix: 'Plant Mix', cores: 'Cores', other: 'Other' }
const typeLabel = t => TYPE_LABELS[t] || t || '—'

const TYPE_COLORS = {
  aggregate:      { bg: '#fef3c7', color: '#92400e' },
  asphalt_binder: { bg: '#e0f2fe', color: '#0369a1' },
  plant_mix:      { bg: '#e8f2ee', color: '#1e4d39' },
  cores:          { bg: '#f3eeff', color: '#7c4dbd' },
  other:          { bg: '#f0efe9', color: '#6b6860' },
}

// ── Material detail card (shared between Scan + List tabs) ──────
function MaterialCard({ material, scannedValue, onClose }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 26 }}>✅</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Material found</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
              {scannedValue || material.barcode_id}
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', padding: 4 }}>✕</button>
        )}
      </div>

      <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {[
            ['Material', material.name || typeLabel(material.material_type)],
            ['Type',     typeLabel(material.material_type)],
            ['Project',  material.projects?.name || '—'],
            ['Project ID', material.projects?.project_id || '—'],
            ['Storage',  material.storage_confirmed ? '✅ Confirmed' : '⏳ Pending'],
            ['Sampled',  material.sampling_date || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {material.storage_notes && (
          <div style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--accent)', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage notes</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{material.storage_notes}</div>
          </div>
        )}

        {(material.locations || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {material.locations.map((loc, i) => (
              <span key={i} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '3px 12px', fontSize: 12, fontWeight: 500 }}>
                📍 {loc.detail || loc.location_id || loc.location}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scan Tab ────────────────────────────────────────────────────
function ScanTab() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const detectorRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraError, setCameraError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [result, setResult] = useState(null)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    setCameraError('')
    try {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          initDetector()
        }
      }
    } catch {
      setCameraError('Camera not available on this device. Use the manual entry below.')
    }
  }

  function stopCamera() {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  function initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'],
        })
      } catch { /* fall through to jsQR */ }
    }
    setScanning(true)
    detectLoop()
  }

  function detectLoop() {
    const video = videoRef.current
    if (!video || video.readyState < 2) { animRef.current = requestAnimationFrame(detectLoop); return }

    if (detectorRef.current) {
      detectorRef.current.detect(video).then(codes => {
        if (codes.length > 0 && codes[0].rawValue) {
          setScanning(false)
          if (animRef.current) cancelAnimationFrame(animRef.current)
          lookupBarcode(codes[0].rawValue)
          return
        }
        animRef.current = requestAnimationFrame(detectLoop)
      }).catch(() => { animRef.current = requestAnimationFrame(detectLoop) })
    } else {
      const canvas = canvasRef.current
      if (!canvas || !video.videoWidth) { animRef.current = requestAnimationFrame(detectLoop); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) {
        setScanning(false)
        lookupBarcode(code.data)
        return
      }
      animRef.current = requestAnimationFrame(detectLoop)
    }
  }

  async function lookupBarcode(value) {
    setLooking(true); setResult(null)
    try {
      const { data } = await sb.from('project_materials')
        .select('*, projects(name, project_id)')
        .eq('barcode_id', value.trim().toUpperCase())
        .maybeSingle()
      setResult(data ? { found: true, material: data, scannedValue: value } : { found: false, scannedValue: value })
    } catch { setResult({ found: false, scannedValue: value, error: true }) }
    setLooking(false)
  }

  function reset() {
    setResult(null); setManualInput(''); setScanning(true); detectLoop()
  }

  return (
    <div>
      {!result && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          {cameraError ? (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{cameraError}</div>
            </div>
          ) : (
            <div style={{ position: 'relative', background: '#000', minHeight: 240 }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: 200, height: 200, position: 'relative' }}>
                  {[['top:0,left:0'],['top:0,right:0'],['bottom:0,left:0'],['bottom:0,right:0']].map(([pos], i) => {
                    const p = Object.fromEntries(pos.split(',').map(s => s.split(':')))
                    return <div key={i} style={{ position: 'absolute', width: 28, height: 28, borderColor: '#00e5b0', borderStyle: 'solid', borderWidth: 0, ...p,
                      ...(pos.includes('top:0') ? { borderTopWidth: 3 } : { borderBottomWidth: 3 }),
                      ...(pos.includes('left:0') ? { borderLeftWidth: 3 } : { borderRightWidth: 3 }),
                      borderRadius: pos.includes('top:0,left:0') ? '6px 0 0 0' : pos.includes('top:0,right:0') ? '0 6px 0 0' : pos.includes('bottom:0,left:0') ? '0 0 0 6px' : '0 0 6px 0'
                    }} />
                  })}
                  {scanning && <div style={{ position: 'absolute', left: 4, right: 4, height: 2, background: 'rgba(0,229,176,0.8)', borderRadius: 1, animation: 'scanline 1.8s ease-in-out infinite' }} />}
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
                {scanning && <span style={{ background: 'rgba(0,0,0,0.55)', color: '#00e5b0', fontSize: 12, padding: '4px 14px', borderRadius: 99, fontWeight: 500 }}>Scanning…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {looking && (
        <div className="card" style={{ textAlign: 'center', padding: '24px', marginBottom: 16 }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Looking up barcode…</div>
        </div>
      )}

      {result && !looking && (
        result.found
          ? <MaterialCard material={result.material} scannedValue={result.scannedValue} onClose={reset} />
          : (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 26 }}>❌</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Not found</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{result.scannedValue}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 14 }}>
                No material with barcode <strong>{result.scannedValue}</strong> was found.
              </div>
              <button className="btn btn-primary" onClick={reset}>📷 Scan another</button>
            </div>
          )
      )}

      {!result && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Manual entry</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
            {cameraError ? 'Enter the barcode ID printed on the label:' : 'Or type a barcode ID directly:'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualInput}
              onChange={e => setManualInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && manualInput.trim() && lookupBarcode(manualInput)}
              placeholder="e.g. 2026-001-AGG-01"
              style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.04em' }}
              autoFocus={!!cameraError}
            />
            <button className="btn btn-primary" onClick={() => manualInput.trim() && lookupBarcode(manualInput)} disabled={!manualInput.trim()}>
              Look up
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── All Materials Tab ───────────────────────────────────────────
function MaterialsTab() {
  const { session } = useAppStore()
  const [materials, setMaterials] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const isSuperAdmin = !session?.userId
    let projQ = sb.from('projects').select('id, name, project_id').order('name')
    if (isSolo && session?.userId) {
      projQ = projQ.eq('solo_owner_id', session.userId)
    } else if (!isSolo && !isSuperAdmin && session?.organizationId) {
      projQ = projQ.eq('organization_id', session.organizationId)
    }
    const { data: projs } = await projQ
    const isScoped = isSolo || (!isSuperAdmin && session?.organizationId)
    if (isScoped && (!projs || projs.length === 0)) {
      setMaterials([]); setProjects([]); setLoading(false); return
    }
    let matsQ = sb.from('project_materials').select('*, projects(id, name, project_id)').order('created_at', { ascending: false })
    if (isScoped && projs?.length) matsQ = matsQ.in('project_id', projs.map(p => p.id))
    const { data: mats } = await matsQ
    setMaterials(mats || [])
    setProjects(projs || [])
    setLoading(false)
  }

  const filtered = materials.filter(m => {
    if (typeFilter && m.material_type !== typeFilter) return false
    if (projectFilter && m.project_id !== projectFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const barcodeMatch = (m.barcode_id || '').toLowerCase().includes(q)
      const nameMatch    = (m.name || '').toLowerCase().includes(q)
      const projMatch    = (m.projects?.name || '').toLowerCase().includes(q)
      if (!barcodeMatch && !nameMatch && !projMatch) return false
    }
    return true
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  return (
    <div>
      {selected && (
        <MaterialCard material={selected} onClose={() => setSelected(null)} />
      )}

      {!selected && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ position: 'relative', flex: '1 1 180px' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)', pointerEvents: 'none' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search barcode, name, project…" style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ flex: '0 1 160px' }}>
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ flex: '0 1 180px' }}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.project_id}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, fontFamily: 'var(--mono)' }}>
            {filtered.length} material{filtered.length !== 1 ? 's' : ''}
            {(search || typeFilter || projectFilter) ? ' (filtered)' : ''}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-icon">📦</div>
              {search || typeFilter || projectFilter ? 'No materials match your filters.' : 'No materials found.'}
            </div>
          ) : (
            filtered.map(m => {
              const tc = TYPE_COLORS[m.material_type] || TYPE_COLORS.other
              return (
                <div key={m.id} className="card" style={{ padding: '12px 16px', marginBottom: 10, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onClick={() => setSelected(m)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                          {m.barcode_id || <span style={{ color: 'var(--text3)', fontWeight: 400 }}>No barcode</span>}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px', background: tc.bg, color: tc.color }}>
                          {typeLabel(m.material_type)}
                        </span>
                        {m.storage_confirmed && <span style={{ fontSize: 11, color: '#1e4d39', background: '#e8f2ee', borderRadius: 99, padding: '2px 8px' }}>✅ Stored</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {m.name && <span style={{ fontWeight: 500 }}>{m.name}</span>}
                        {m.projects?.name && <span style={{ color: 'var(--text3)' }}>📁 {m.projects.name}</span>}
                        {m.sampling_date && <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>📅 {m.sampling_date}</span>}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: 18, flexShrink: 0 }}>›</div>
                  </div>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}

// ── Summary Tab ─────────────────────────────────────────────────
function SummaryTab() {
  const { session } = useAppStore()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    const isSuperAdmin = !session?.userId
    let scopedProjectIds = null
    if (isSolo && session?.userId) {
      const { data: projs } = await sb.from('projects').select('id').eq('solo_owner_id', session.userId)
      scopedProjectIds = (projs || []).map(p => p.id)
    } else if (!isSolo && !isSuperAdmin && session?.organizationId) {
      const { data: projs } = await sb.from('projects').select('id').eq('organization_id', session.organizationId)
      scopedProjectIds = (projs || []).map(p => p.id)
    }
    if (scopedProjectIds !== null && scopedProjectIds.length === 0) {
      setStats({ total: 0, withBarcode: 0, stored: 0, byType: {}, byProject: {} }); setLoading(false); return
    }
    let q = sb.from('project_materials').select('material_type, storage_confirmed, barcode_id, projects(name, project_id)')
    if (scopedProjectIds !== null) q = q.in('project_id', scopedProjectIds)
    const { data } = await q
    if (!data) { setLoading(false); return }

    const byType = {}
    const byProject = {}
    let withBarcode = 0, stored = 0

    data.forEach(m => {
      const t = m.material_type || 'other'
      byType[t] = (byType[t] || 0) + 1
      const pname = m.projects?.name || 'Unassigned'
      byProject[pname] = (byProject[pname] || 0) + 1
      if (m.barcode_id) withBarcode++
      if (m.storage_confirmed) stored++
    })

    setStats({ total: data.length, withBarcode, stored, byType, byProject })
    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!stats || stats.total === 0) return <div className="empty-state" style={{ padding: 32 }}><div className="empty-icon">📊</div>No materials yet.</div>

  return (
    <div>
      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Materials', value: stats.total, color: 'var(--text)' },
          { label: 'With Barcode', value: stats.withBarcode, color: 'var(--accent)' },
          { label: 'Storage Confirmed', value: stats.stored, color: '#1D9E75' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* By type */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>By Material Type</div>
        {Object.entries(TYPE_LABELS).map(([key, label]) => {
          const count = stats.byType[key] || 0
          if (!count) return null
          const tc = TYPE_COLORS[key] || TYPE_COLORS.other
          const pct = Math.round(count / stats.total * 100)
          return (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px', background: tc.bg, color: tc.color }}>{label}</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: tc.color, borderRadius: 99, width: `${pct}%`, transition: 'width 0.4s ease', opacity: 0.75 }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* By project */}
      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>By Project</div>
        {Object.entries(stats.byProject)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{count} material{count !== 1 ? 's' : ''}</div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── Shared scanner content (used by both the standalone screen and BarcodeManager tab) ──
export function ScannerContent() {
  const [tab, setTab] = useState('scan')
  const tabs = [
    { key: 'scan',      label: '📷 Scan' },
    { key: 'materials', label: '📦 All Materials' },
    { key: 'summary',   label: '📊 Summary' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `3px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, marginBottom: -2, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'scan'      && <ScanTab />}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'summary'   && <SummaryTab />}
      <style>{`
        @keyframes scanline {
          0%   { top: 8px; opacity: 1; }
          50%  { top: calc(100% - 8px); opacity: 1; }
          100% { top: 8px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Main Screen (standalone — for solo users / students) ─────────
export default function BarcodeScannerScreen() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">QR Scan</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Scan or browse project materials</div>
      </div>
      <ScannerContent />
    </div>
  )
}
