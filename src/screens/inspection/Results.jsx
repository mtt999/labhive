import * as XLSX from 'xlsx-js-style'
import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { sb } from '../../lib/supabase'

function safeSheetName(name) { return name.replace(/[:\\\/?*\[\]]/g, '-').substring(0, 31) }
function fmtLinks(links) { return (links || []).map(l => `${l.label || 'Link'}: ${l.url}`).join(' | ') }

const STYLE_HEADER = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'D9EAD3' } },
}
const STYLE_LOW = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'FFFF00' } },
}
const STYLE_TITLE = { font: { bold: true, sz: 13 } }
const STYLE_SECTION = { font: { bold: true } }
const STYLE_WARN = { font: { bold: true, color: { rgb: 'B45309' } } }

function applyRowStyle(ws, rowIdx, numCols, style) {
  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: rowIdx, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
}

function buildInspectionSheet(rec, results) {
  const rlow = results.filter(r => r.low)
  const dateStr = new Date(rec.inspected_at).toLocaleString()
  const rows = []
  const styles = {}   // rowIndex → style

  rows.push(['LabStock — Inspection Report']); styles[rows.length - 1] = STYLE_TITLE
  rows.push(['Date:', dateStr])
  rows.push(['Inspector:', rec.inspector])
  rows.push(['Room:', rec.room_name])
  rows.push([])

  if (rlow.length) {
    rows.push(['⚠ ITEMS NEEDING RESTOCK']); styles[rows.length - 1] = STYLE_WARN
    rows.push(['Item', 'Unit', 'Current Count', 'Minimum', 'Shortage', 'Notes', 'Purchase Links']); styles[rows.length - 1] = STYLE_HEADER
    rlow.forEach(r => { rows.push([r.name, r.unit, r.qty, r.min_qty, r.min_qty - r.qty, r.notes || '', fmtLinks(r.links)]); styles[rows.length - 1] = STYLE_LOW })
    rows.push([])
  }

  rows.push(['FULL INVENTORY']); styles[rows.length - 1] = STYLE_SECTION
  rows.push(['Item', 'Unit', 'Count', 'Minimum', 'Status', 'Notes', 'Purchase Links']); styles[rows.length - 1] = STYLE_HEADER
  results.forEach(r => {
    rows.push([r.name, r.unit, r.qty, r.min_qty, r.low ? 'NEEDS RESTOCK' : 'OK', r.notes || '', fmtLinks(r.links)])
    if (r.low) styles[rows.length - 1] = STYLE_LOW
  })

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 50 }]

  Object.entries(styles).forEach(([rowIdx, style]) => {
    applyRowStyle(ws, Number(rowIdx), 7, style)
  })

  return ws
}

function downloadWb(wb, filename) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function Results() {
  const { lastRecord, setScreen, toast, session } = useAppStore()
  const isSolo = session?.loginMode === 'solo'
  const orgId = session?.organizationId
  useEffect(() => { if (!lastRecord) setScreen('home') }, [lastRecord])
  if (!lastRecord) return null

  const results = lastRecord.results || []
  const low = results.filter(r => r.low)

  function exportExcel() {
    try {
      const dateFile = new Date(lastRecord.inspected_at).toLocaleDateString('en-CA')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, buildInspectionSheet(lastRecord, results), 'Inspection')
      downloadWb(wb, `LabStock_${safeSheetName(lastRecord.room_name)}_${dateFile}.xlsx`)
      toast('Export ready — low items highlighted in yellow')
    } catch (e) {
      toast('Export failed: ' + (e?.message || String(e)))
    }
  }

  async function exportAllRecords() {
    try {
      toast('Loading all records…')
      let q = sb.from('inspections').select('*').order('inspected_at', { ascending: true })
      if (!isSolo) q = q.eq('organization_id', orgId || '00000000-0000-0000-0000-000000000000')
      const { data: allRecs, error } = await q
      if (error || !allRecs?.length) { toast('No records found.'); return }

      const wb = XLSX.utils.book_new()

      // Summary sheet
      const sumRows = []
      const sumStyles = {}
      sumRows.push(['LabStock — All Inspection Records']); sumStyles[0] = STYLE_TITLE
      sumRows.push(['Exported:', new Date().toLocaleString()])
      sumRows.push(['Total:', allRecs.length])
      sumRows.push([])
      sumRows.push(['Date', 'Room', 'Inspector', 'Total Items', 'Low Items', 'Status']); sumStyles[sumRows.length - 1] = STYLE_HEADER
      allRecs.forEach(rec => {
        const d = new Date(rec.inspected_at)
        sumRows.push([d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), rec.room_name, rec.inspector, (rec.results || []).length, rec.flag_count || 0, rec.flag_count > 0 ? 'Has low items' : 'All OK'])
        if (rec.flag_count > 0) sumStyles[sumRows.length - 1] = STYLE_LOW
      })
      const sumWs = XLSX.utils.aoa_to_sheet(sumRows)
      sumWs['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
      Object.entries(sumStyles).forEach(([r, style]) => applyRowStyle(sumWs, Number(r), 6, style))
      XLSX.utils.book_append_sheet(wb, sumWs, 'Summary')

      const sheetNames = new Set()
      allRecs.forEach(rec => {
        const d = new Date(rec.inspected_at)
        let sn = safeSheetName(`${d.toLocaleDateString('en-CA')} ${rec.room_name}`)
        let fn = sn, c = 2
        while (sheetNames.has(fn)) fn = safeSheetName(sn.substring(0, 28) + c++)
        sheetNames.add(fn)
        XLSX.utils.book_append_sheet(wb, buildInspectionSheet(rec, rec.results || []), fn)
      })

      downloadWb(wb, `LabStock_AllRecords_${new Date().toLocaleDateString('en-CA')}.xlsx`)
      toast(`Exported ${allRecs.length} inspections!`)
    } catch (e) {
      toast('Export failed: ' + (e?.message || String(e)))
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Inspection complete</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={exportExcel}>📄 This Inspection</button>
          <button className="btn btn-sm" onClick={exportAllRecords}>📚 All Records</button>
          <button className="btn btn-sm btn-primary" onClick={() => setScreen('home')}>Done</button>
        </div>
      </div>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, textAlign: 'center' }}>
          <div><div style={{ fontSize: 24, fontWeight: 600 }}>{results.length}</div><div className="text-muted">Total</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent)' }}>{results.length - low.length}</div><div className="text-muted">OK</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent2)' }}>{low.length}</div><div className="text-muted">Need restock</div></div>
        </div>
        <div className="divider" />
        <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{lastRecord.room_name} · {new Date(lastRecord.inspected_at).toLocaleString()} · {lastRecord.inspector}</div>
      </div>
      <div className="card">
        <div className="card-title">All items</div>
        <table>
          <thead><tr><th>Item</th><th>Count</th><th>Min</th><th>Status</th></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className={r.low ? 'flag-red' : ''}>
                <td><strong>{r.name}</strong></td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.qty} {r.unit}</td>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.min_qty}</td>
                <td><span className={`badge badge-${r.low ? 'low' : 'ok'}`}>{r.low ? 'LOW' : 'OK'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
