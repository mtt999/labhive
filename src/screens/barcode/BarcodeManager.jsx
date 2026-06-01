import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { ScannerContent, MaterialTypesManager } from './BarcodeScannerScreen'
import { isNative } from '../../lib/scanner.js'

// Colorful logo for screen preview
function ILabLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <polygon points="256,4 468,126 468,378 256,500 44,378 44,126" fill="#ffb380"/>
      <polygon points="256,14 458,132 458,372 256,490 54,372 54,132" fill="#ff7f2a"/>
      <polygon points="256,30 450,140 450,362 256,472 62,362 62,140" fill="#000080"/>
      <polygon points="256,58 422,152 422,350 256,444 90,350 90,152" fill="none" stroke="#ff6b00" strokeWidth="1.2" opacity="0.25"/>
      <circle cx="256" cy="30"  r="9" fill="#ff6b00"/>
      <circle cx="450" cy="140" r="9" fill="#ff6b00"/>
      <circle cx="450" cy="362" r="9" fill="#ff6b00"/>
      <circle cx="256" cy="472" r="9" fill="#ff6b00"/>
      <circle cx="62"  cy="362" r="9" fill="#ff6b00"/>
      <circle cx="62"  cy="140" r="9" fill="#ff6b00"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ff6b00" strokeWidth="3.5" opacity="0.95"/>
      <circle cx="394" cy="224" r="16" fill="#ff6b00"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ff9a3c" strokeWidth="3" opacity="0.85" transform="rotate(60 256 224)"/>
      <circle cx="179.16718" cy="294.86069" r="15" fill="#ff9a3c"/>
      <ellipse cx="256" cy="224" rx="138" ry="44" fill="none" stroke="#ffba6e" strokeWidth="2.5" opacity="0.75" transform="rotate(-60 256 224)"/>
      <circle cx="325" cy="105" r="14" fill="#ffba6e"/>
      <circle cx="256" cy="224" r="38" fill="#ff6b00" opacity="0.10"/>
      <circle cx="256" cy="224" r="26" fill="#ff6b00" opacity="0.22"/>
      <circle cx="256" cy="224" r="16" fill="#ff8c00" opacity="0.80"/>
      <circle cx="256" cy="224" r="9"  fill="#ffb347"/>
      <text x="258.37772" y="415" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="92" fontWeight="700">
        <tspan fontStyle="italic" fill="#ff6b00">i</tspan>
        <tspan fill="#ffffff" dx="-5">Lab</tspan>
      </text>
    </svg>
  )
}

// Pure B&W logo for print labels — black outline on white, prints on any printer
const PRINT_LOGO_SVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#fff"/>
  <polygon points="256,20 460,133 460,379 256,492 52,379 52,133" fill="#fff" stroke="#000" stroke-width="20"/>
  <text x="256" y="415" text-anchor="middle" font-family="Arial" font-size="88" font-weight="700">
    <tspan font-style="italic" fill="#000">i</tspan><tspan fill="#000" dx="-4">Lab</tspan>
  </text>
</svg>`

function getScanUrl(equipmentId) {
  const base = isNative() ? 'https://labhive.app/' : `${window.location.origin}/ilab/`
  return `${base}?eq=${equipmentId}`
}

// QR label for screen preview — colorful logo, iLab logo centered over QR
function QRLabel({ equipment, size }) {
  const is2x2 = size === '2x2'
  const containerPx = is2x2 ? 192 : 384
  const qrPx       = is2x2 ? 112 : 230
  const logoInQr   = is2x2 ? 36  : 72
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrPx * 2}x${qrPx * 2}&data=${encodeURIComponent(getScanUrl(equipment.id))}&margin=4&color=000000&bgcolor=ffffff&ecc=H`

  return (
    <div style={{
      width: containerPx, height: containerPx,
      background: '#ffffff',
      border: '2.5px solid #111',
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: is2x2 ? '6px 8px' : '12px 16px',
      fontFamily: 'Arial, sans-serif',
      boxSizing: 'border-box',
      gap: is2x2 ? 6 : 12,
      overflow: 'hidden',
    }}>
      {/* QR code with iLab logo centered inside */}
      <div style={{ position: 'relative', width: qrPx, height: qrPx, flexShrink: 0 }}>
        <img src={qrUrl} width={qrPx} height={qrPx} style={{ display: 'block', imageRendering: 'pixelated' }} alt="QR Code" />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#fff', borderRadius: 4, padding: is2x2 ? 2 : 4, lineHeight: 0 }}>
            <ILabLogo size={logoInQr} />
          </div>
        </div>
      </div>

      {/* SCAN ME */}
      <div style={{
        fontSize: is2x2 ? 8 : 14, fontWeight: 800,
        color: '#ff6b00', letterSpacing: '0.18em',
        textTransform: 'uppercase', textAlign: 'center',
      }}>
        ◀ SCAN ME ▶
      </div>

      {/* Equipment name */}
      <div style={{
        fontSize: is2x2 ? 8 : 13, fontWeight: 700,
        color: '#111', textAlign: 'center',
        lineHeight: 1.2, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        width: '100%',
      }}>
        {equipment.equipment_name}
        {equipment.nickname ? ` (${equipment.nickname})` : ''}
      </div>
    </div>
  )
}

function printLabels(equipmentList, size) {
  const is2x2 = size === '2x2'
  const inchSize = is2x2 ? '2in' : '4in'
  const containerPx = is2x2 ? 192 : 384
  const qrPx  = is2x2 ? 112 : 230
  const logoInQr = is2x2 ? 36 : 72

  const labelHtml = (eq) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrPx * 2}x${qrPx * 2}&data=${encodeURIComponent(getScanUrl(eq.id))}&margin=4&color=000000&bgcolor=ffffff&ecc=H`
    const logoSvg = PRINT_LOGO_SVG(logoInQr)
    const name = (eq.equipment_name + (eq.nickname ? ` (${eq.nickname})` : '')).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div class="label">
  <div class="qr-wrap"><img class="qr-img" src="${qrUrl}" alt="QR"/><div class="qr-logo">${logoSvg}</div></div>
  <div class="scan-me">&#9664; SCAN ME &#9654;</div>
  <div class="eq-name">${name}</div>
</div>`
  }

  const html = `<!DOCTYPE html><html><head><title>QR Labels — iLab</title>
<style>
  @page { size: ${inchSize} ${inchSize}; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  .label {
    width: ${containerPx}px; height: ${containerPx}px;
    background: #fff; border: 2.5px solid #111; border-radius: 6px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: ${is2x2 ? '6px 8px' : '12px 16px'};
    font-family: Arial, sans-serif; overflow: hidden; gap: ${is2x2 ? 6 : 12}px;
    page-break-after: always; page-break-inside: avoid;
  }
  .label:last-child { page-break-after: auto; }
  .qr-wrap { position: relative; width: ${qrPx}px; height: ${qrPx}px; flex-shrink: 0; }
  .qr-img  { display: block; width: ${qrPx}px; height: ${qrPx}px; }
  .qr-logo { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .qr-logo > svg, .qr-logo > * { background: #fff; border-radius: 4px; padding: ${is2x2 ? 2 : 4}px; display: block; }
  .scan-me { font-size: ${is2x2 ? 8 : 14}px; font-weight: 800; color: #333; letter-spacing: 0.18em; text-transform: uppercase; text-align: center; }
  .eq-name { font-size: ${is2x2 ? 8 : 13}px; font-weight: 700; color: #111; text-align: center; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
</style></head><body>
${equipmentList.map(labelHtml).join('\n')}
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},800)}<\/script>
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch(e) {}
    setTimeout(() => document.body.removeChild(iframe), 3000)
  }, 800)
}

// ── Equipment Barcode tab ─────────────────────────────────────────────────────

function EquipmentBarcodeTab({ equipment, loading }) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [selected, setSelected] = useState(null)
  const [printSize, setPrintSize] = useState('2x2')
  const [copied, setCopied] = useState(false)

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))]
  const filtered = equipment.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || (e.equipment_name || '').toLowerCase().includes(q) || (e.nickname || '').toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q)
    const matchCat = !filterCat || e.category === filterCat
    return matchSearch && matchCat
  })

  function copyUrl() {
    if (!selected) return
    navigator.clipboard.writeText(getScanUrl(selected.id))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* Left: equipment list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Select Equipment</div>
          <input
            type="search"
            placeholder="Search by name, nickname, location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)' }}
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>No equipment found.</div>
          ) : filtered.map(eq => (
            <div
              key={eq.id}
              onClick={() => setSelected(eq)}
              style={{
                padding: '11px 16px',
                borderBottom: '0.5px solid var(--surface2)',
                cursor: 'pointer',
                background: selected?.id === eq.id ? 'var(--accent-light)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (selected?.id !== eq.id) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (selected?.id !== eq.id) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: selected?.id === eq.id ? 'var(--accent)' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: selected?.id === eq.id ? '#fff' : 'var(--text3)',
                fontWeight: 700,
              }}>
                {selected?.id === eq.id ? '✓' : '🔧'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: selected?.id === eq.id ? 700 : 500, color: selected?.id === eq.id ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {eq.equipment_name}
                  {eq.nickname && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>({eq.nickname})</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                  {[eq.category, eq.location].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: preview + print */}
      <div>
        {selected ? (
          <>
            {/* Print size toggle */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Label Size</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ v: '2x2', label: '2 × 2 inches', sub: 'Small — compact equipment' }, { v: '4x4', label: '4 × 4 inches', sub: 'Large — easy scanning from distance' }].map(opt => (
                  <div
                    key={opt.v}
                    onClick={() => setPrintSize(opt.v)}
                    style={{
                      flex: 1, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: printSize === opt.v ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: printSize === opt.v ? 'var(--accent-light)' : 'var(--surface)',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: printSize === opt.v ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Label Preview</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <QRLabel equipment={selected} size={printSize} />
              </div>
            </div>

            {/* Scan URL */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Scan URL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getScanUrl(selected.id)}
                </div>
                <button onClick={copyUrl} className="btn btn-sm" style={{ flexShrink: 0, background: copied ? '#e8f2ee' : undefined, color: copied ? '#2a6049' : undefined }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Print button */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={() => printLabels([selected], printSize)}
            >
              🖨️ Print Label ({printSize === '2x2' ? '2×2 in' : '4×4 in'})
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
              A print dialog will open. Make sure your printer is set to the correct paper size.
            </div>
          </>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 360 }}>
            <div style={{ fontSize: 48 }}>🔲</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Select equipment to generate a QR label</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
              Choose any piece of equipment from the list on the left to preview and print its QR code label.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Records tab ───────────────────────────────────────────────────────────────

function RecordsTab({ equipment, loading }) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [exportSize, setExportSize] = useState('2x2')

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))]
  const filtered = equipment.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || (e.equipment_name || '').toLowerCase().includes(q) || (e.nickname || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q)
    const matchCat = !filterCat || e.category === filterCat
    return matchSearch && matchCat
  })

  const allSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id))
  const someSelected = filtered.some(e => selected.has(e.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); filtered.forEach(e => n.delete(e.id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); filtered.forEach(e => n.add(e.id)); return n })
    }
  }

  function toggleOne(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function exportSelected() {
    const list = equipment.filter(e => selected.has(e.id))
    if (!list.length) return
    printLabels(list, exportSize)
  }

  const selectedCount = [...selected].filter(id => equipment.some(e => e.id === id)).length

  // Group by category for the table
  const grouped = filtered.reduce((acc, eq) => {
    const cat = eq.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(eq)
    return acc
  }, {})

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search equipment…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Export controls — always visible, disabled when nothing selected */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <select
            value={exportSize}
            onChange={e => setExportSize(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)' }}
          >
            <option value="2x2">2 × 2 in</option>
            <option value="4x4">4 × 4 in</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={exportSelected}
            disabled={selectedCount === 0}
            style={{ opacity: selectedCount === 0 ? 0.45 : 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            🖨️ Export PDF{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 160px 120px 100px', gap: 0, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={toggleAll}
              style={{ width: 'auto', cursor: 'pointer' }}
            />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equipment</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR Status</div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>No equipment found.</div>
        ) : Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div style={{ padding: '6px 16px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {cat} <span style={{ fontWeight: 400, opacity: 0.7 }}>({items.length})</span>
            </div>
            {items.map((eq, idx) => (
              <div
                key={eq.id}
                onClick={() => toggleOne(eq.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr 160px 120px 100px',
                  padding: '10px 16px',
                  borderBottom: idx < items.length - 1 ? '0.5px solid var(--surface2)' : 'none',
                  background: selected.has(eq.id) ? 'var(--accent-light)' : 'transparent',
                  cursor: 'pointer', transition: 'background 0.1s', alignItems: 'center',
                }}
                onMouseEnter={e => { if (!selected.has(eq.id)) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!selected.has(eq.id)) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.has(eq.id)} onChange={() => toggleOne(eq.id)} onClick={e => e.stopPropagation()} style={{ width: 'auto', cursor: 'pointer' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: selected.has(eq.id) ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {eq.equipment_name}
                  </div>
                  {eq.nickname && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{eq.nickname}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eq.category || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eq.location || '—'}</div>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2a6049', background: '#e8f2ee', borderRadius: 6, padding: '2px 8px' }}>
                    ✓ Ready
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          {filtered.length} equipment · {selectedCount} selected
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BarcodeManager() {
  const { session } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('equipment')

  const isAdminOrStaff = session?.role === 'admin' || session?.role === 'user'

  useEffect(() => { loadEquipment() }, [])

  async function loadEquipment() {
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('equipment_inventory').select('id, equipment_name, nickname, category, location').eq('is_active', true).order('category').order('equipment_name')
    if (!isSolo) q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setEquipment(data || [])
    setLoading(false)
  }

  if (!isAdminOrStaff) return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">Barcode Scanner</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Scan or browse project materials</div>
      </div>
      <ScannerContent />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e8eeff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔲</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>Barcode / QR Scan</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Generate and print QR labels for lab equipment</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f4ff', border: '1px solid #c7d7f9', borderRadius: 10, fontSize: 13, color: '#1a56db' }}>
          When scanned with a phone camera, the QR code opens the iLab login page. After logging in, users get quick access to equipment info, booking, maintenance history, and more.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'equipment', label: '🔲 Equipment Barcode',   sub: 'Generate & print QR labels' },
          { key: 'records',   label: '📋 Records',             sub: 'Equipment list & bulk export' },
          { key: 'materials', label: '📷 Project Materials',   sub: 'Scan & browse project materials' },
          { key: 'types',     label: '🏷️ Material Types',      sub: 'Manage material type list' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600,
              border: 'none', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
              cursor: 'pointer', transition: 'all 0.12s', borderRadius: '8px 8px 0 0',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equipment' && <EquipmentBarcodeTab equipment={equipment} loading={loading} />}
      {tab === 'records'   && <RecordsTab          equipment={equipment} loading={loading} />}
      {tab === 'materials' && <ScannerContent />}
      {tab === 'types'     && <MaterialTypesManager session={session} />}
    </div>
  )
}
