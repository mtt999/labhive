import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { sendTaskNotification } from '../lib/notify'

// ── Color constants ───────────────────────────────────────────
const C = {
  available_pallet: '#f0efe9',
  available_shelf: '#d4a520',
  selected: '#9FE1CB',
  occupied: '#e24b4a',
  selected_stroke: '#0F6E56',
  occupied_stroke: '#a32d2d',
  shelf_header: '#8b6914',
  floor: '#b06050',
}

// ── Tooltip ───────────────────────────────────────────────────
function Tooltip({ x, y, info, onClose }) {
  if (!info) return null
  return (
    <g>
      <rect x={x - 70} y={y - 44} width={140} height={40} rx={4}
        fill="white" stroke="#e24b4a" strokeWidth={1} />
      <text x={x} y={y - 30} textAnchor="middle" fontSize={9} fontFamily="sans-serif" fill="#a32d2d" fontWeight="500">{info.project_name || 'Occupied'}</text>
      <text x={x} y={y - 18} textAnchor="middle" fontSize={8} fontFamily="sans-serif" fill="#666">{info.material_type || ''}</text>
    </g>
  )
}

// ══════════════════════════════════════════════════════════════
// ICT BUILDING MAP
// ══════════════════════════════════════════════════════════════
function ICTMap({ occupancy, selected, onToggle, canEdit }) {
  const [tooltip, setTooltip] = useState(null)

  function getRoomFill(id) {
    if (selected.includes(id)) return C.selected
    if (occupancy[id]?.occupied) return C.occupied
    return '#f8f7f4'
  }
  function getRoomStroke(id) {
    if (selected.includes(id)) return C.selected_stroke
    if (occupancy[id]?.occupied) return C.occupied_stroke
    return '#888'
  }

  function handleClick(id, label, cx, cy) {
    const occ = occupancy[id]
    if (occ?.occupied && !selected.includes(id)) {
      setTooltip({ id, x: cx, y: cy, ...occ })
      return
    }
    setTooltip(null)
    onToggle(id, label, 'ICT')
  }

  const rooms = [
    { id: 'ICT-134', label: '134', x: 6, y: 6, w: 52, h: 140, tx: 32, ty: 80 },
    { id: 'ICT-132', label: '132', x: 60, y: 6, w: 52, h: 100, tx: 86, ty: 58 },
    { id: 'ICT-133', label: '133', x: 60, y: 108, w: 30, h: 38, tx: 75, ty: 130 },
    { id: 'ICT-137', label: '137', x: 92, y: 108, w: 30, h: 38, tx: 107, ty: 130 },
    { id: 'ICT-136', label: '136', x: 124, y: 108, w: 72, h: 38, tx: 160, ty: 130 },
    { id: 'ICT-HighBayA', label: 'High Bay A\n130', x: 114, y: 6, w: 182, h: 100, tx: 205, ty: 52 },
    { id: 'ICT-HighBayB', label: 'High Bay B\n129', x: 298, y: 6, w: 172, h: 80, tx: 384, ty: 44 },
    { id: 'ICT-ServoRoom', label: 'Servo Room\n129A', x: 318, y: 88, w: 132, h: 58, tx: 384, ty: 118 },
    { id: 'ICT-HighBayC', label: 'High Bay C\n128', x: 472, y: 6, w: 162, h: 100, tx: 553, ty: 52 },
    { id: 'ICT-127', label: '127', x: 636, y: 80, w: 38, h: 66, tx: 655, ty: 116 },
    { id: 'ICT-BinderLab', label: 'Binder Lab\n126', x: 676, y: 6, w: 56, h: 58, tx: 704, ty: 32 },
    { id: 'ICT-SolventRoom', label: 'Solvent Rm\n125', x: 734, y: 6, w: 58, h: 58, tx: 763, ty: 32 },
    { id: 'ICT-VolumetricLab', label: 'Vol Lab\n124', x: 676, y: 66, w: 56, h: 56, tx: 704, ty: 92 },
    { id: 'ICT-SoilLab', label: 'Soil Lab\n123', x: 734, y: 66, w: 56, h: 56, tx: 762, ty: 92 },
    { id: 'ICT-REsOffice', label: 'REs\n122', x: 792, y: 6, w: 24, h: 116, tx: 804, ty: 60 },
    { id: 'ICT-101', label: '101', x: 6, y: 158, w: 56, h: 96, tx: 34, ty: 208 },
    { id: 'ICT-102', label: '102', x: 64, y: 158, w: 56, h: 96, tx: 92, ty: 208 },
    { id: 'ICT-103', label: '103', x: 122, y: 158, w: 56, h: 96, tx: 150, ty: 208 },
    { id: 'ICT-104', label: '104', x: 180, y: 158, w: 48, h: 48, tx: 204, ty: 185 },
    { id: 'ICT-104A', label: '104A', x: 180, y: 208, w: 48, h: 46, tx: 204, ty: 234 },
    { id: 'ICT-105', label: '105', x: 230, y: 158, w: 56, h: 96, tx: 258, ty: 208 },
    { id: 'ICT-106', label: '106', x: 288, y: 158, w: 48, h: 48, tx: 312, ty: 185 },
    { id: 'ICT-107', label: '107', x: 288, y: 208, w: 48, h: 46, tx: 312, ty: 234 },
    { id: 'ICT-108', label: '108', x: 338, y: 158, w: 48, h: 96, tx: 362, ty: 208 },
    { id: 'ICT-109', label: '109', x: 388, y: 158, w: 48, h: 96, tx: 412, ty: 208 },
    { id: 'ICT-111', label: '111', x: 438, y: 158, w: 48, h: 96, tx: 462, ty: 208 },
    { id: 'ICT-112', label: '112', x: 488, y: 158, w: 36, h: 48, tx: 506, ty: 185 },
    { id: 'ICT-113', label: '113', x: 488, y: 208, w: 36, h: 46, tx: 506, ty: 234 },
    { id: 'ICT-114', label: '114', x: 526, y: 158, w: 36, h: 48, tx: 544, ty: 185 },
    { id: 'ICT-115', label: '115', x: 526, y: 208, w: 56, h: 46, tx: 554, ty: 234 },
    { id: 'ICT-116', label: '116', x: 584, y: 158, w: 56, h: 96, tx: 612, ty: 208 },
    { id: 'ICT-117', label: '117', x: 642, y: 158, w: 56, h: 96, tx: 670, ty: 208 },
    { id: 'ICT-118', label: '118', x: 700, y: 158, w: 42, h: 96, tx: 721, ty: 208 },
    { id: 'ICT-119', label: '119', x: 744, y: 158, w: 36, h: 60, tx: 762, ty: 190 },
    { id: 'ICT-119A', label: '119A', x: 744, y: 220, w: 36, h: 34, tx: 762, ty: 240 },
    { id: 'ICT-122', label: '122', x: 782, y: 158, w: 34, h: 96, tx: 799, ty: 208 },
  ]

  return (
    <svg viewBox="0 0 820 260" width="100%" style={{ minWidth: 600, display: 'block' }}
      onClick={e => { if (e.target.tagName === 'svg') setTooltip(null) }}>
      <rect x="2" y="2" width="816" height="256" fill="#f5f4f0" stroke="#555" strokeWidth="2" rx="2"/>
      <rect x="6" y="148" width="810" height="8" fill="#ddd"/>

      {rooms.map(r => {
        const lines = r.label.split('\n')
        const cx = r.x + r.w / 2
        const cy = r.y + r.h / 2
        const occ = occupancy[r.id]
        return (
          <g key={r.id} style={{ cursor: occ?.occupied && !selected.includes(r.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => handleClick(r.id, r.label.replace('\n', ' '), cx, cy)}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h}
              fill={getRoomFill(r.id)} stroke={getRoomStroke(r.id)} strokeWidth={selected.includes(r.id) ? 2 : 1.2} rx="1"/>
            {lines.map((line, i) => (
              <text key={i} x={r.tx} y={r.ty + (i - (lines.length - 1) / 2) * 13}
                textAnchor="middle" fontSize={r.w < 40 ? 8 : 10} fontFamily="sans-serif"
                fill={occ?.occupied && !selected.includes(r.id) ? '#fff' : '#333'} fontWeight="500">
                {line}
              </text>
            ))}
          </g>
        )
      })}

      {/* ── High Bay C shelves: 14 shelves along right wall, numbered 1-14 bottom to top ── */}
      {Array.from({ length: 14 }, (_, i) => {
        const shelfNum = i + 1
        const id = `ICT-HBC-S${shelfNum}`
        // Right wall of HBC: x=472, y=6, w=162, h=100
        // Shelves along right wall (x ~620), stacked bottom to top
        // Each shelf unit is ~6px wide, rows are 3 cols
        const shelfX = 620
        const shelfH = 6  // shelf header height
        const rowH = 8
        const unitH = shelfH + 3 * rowH
        const shelfY = 6 + 100 - (i + 1) * (unitH + 2)  // bottom to top
        return (
          <g key={id}>
            <rect x={shelfX} y={shelfY} width={12} height={shelfH} fill="#8b6914" rx="1"/>
            <text x={shelfX + 6} y={shelfY + 5} textAnchor="middle" fontSize={4} fontFamily="sans-serif" fill="#fff">{shelfNum}</text>
            {[1,2,3].map(row => {
              const rowId = `${id}-R${row}`
              const ry0 = shelfY + shelfH + (row - 1) * rowH
              const occ = occupancy[rowId]
              return (
                <g key={rowId} style={{ cursor: occ?.occupied && !selected.includes(rowId) ? 'not-allowed' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleClick(rowId, `HBC Shelf ${shelfNum} · Row ${row}`, shelfX + 6, ry0 + rowH/2) }}>
                  <rect x={shelfX} y={ry0} width={12} height={rowH - 1} rx="1"
                    fill={selected.includes(rowId) ? C.selected : occ?.occupied ? C.occupied : '#d4a520'}
                    stroke={selected.includes(rowId) ? C.selected_stroke : occ?.occupied ? C.occupied_stroke : '#8b6914'}
                    strokeWidth={selected.includes(rowId) ? 1.5 : 0.8}/>
                  <text x={shelfX + 6} y={ry0 + rowH - 2} textAnchor="middle" fontSize={4} fontFamily="sans-serif"
                    fill={occ?.occupied && !selected.includes(rowId) ? '#fff' : '#3d2a00'}>R{row}</text>
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ── High Bay B shelves: 5 shelves clustered at LEFT side of top wall, numbered 1-5 left to right ── */}
      {Array.from({ length: 5 }, (_, i) => {
        const shelfNum = i + 1
        const id = `ICT-HBB-S${shelfNum}`
        // HBB: x=298, y=6, w=172, h=80
        // All 5 shelves packed at the left side of top wall starting at x=300
        const unitW = 18
        const gap = 2
        const startX = 300 + i * (unitW + gap)
        const shelfY = 10
        const shelfHeaderH = 5
        const rowH = 7
        return (
          <g key={id}>
            <rect x={startX} y={shelfY} width={unitW} height={shelfHeaderH} fill="#8b6914" rx="1"/>
            <text x={startX + unitW/2} y={shelfY + 4} textAnchor="middle" fontSize={4} fontFamily="sans-serif" fill="#fff">S{shelfNum}</text>
            {[1,2,3].map(row => {
              const rowId = `${id}-R${row}`
              const ry0 = shelfY + shelfHeaderH + (row - 1) * rowH
              const occ = occupancy[rowId]
              return (
                <g key={rowId} style={{ cursor: occ?.occupied && !selected.includes(rowId) ? 'not-allowed' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleClick(rowId, `HBB Shelf ${shelfNum} · Row ${row}`, startX + unitW/2, ry0 + rowH/2) }}>
                  <rect x={startX} y={ry0} width={unitW} height={rowH - 1} rx="1"
                    fill={selected.includes(rowId) ? C.selected : occ?.occupied ? C.occupied : '#d4a520'}
                    stroke={selected.includes(rowId) ? C.selected_stroke : occ?.occupied ? C.occupied_stroke : '#8b6914'}
                    strokeWidth={selected.includes(rowId) ? 1.5 : 0.8}/>
                  <text x={startX + unitW/2} y={ry0 + rowH - 2} textAnchor="middle" fontSize={4} fontFamily="sans-serif"
                    fill={occ?.occupied && !selected.includes(rowId) ? '#fff' : '#3d2a00'}>R{row}</text>
                </g>
              )
            })}
          </g>
        )
      })}

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════
// MPF MAP
// ══════════════════════════════════════════════════════════════
function MPFMap({ occupancy, selected, onToggle, canEdit }) {
  const [tooltip, setTooltip] = useState(null)

  function getFill(id, isShelf) {
    if (selected.includes(id)) return C.selected
    if (occupancy[id]?.occupied) return C.occupied
    return isShelf ? C.available_shelf : C.available_pallet
  }
  function getStroke(id, isShelf) {
    if (selected.includes(id)) return C.selected_stroke
    if (occupancy[id]?.occupied) return C.occupied_stroke
    return isShelf ? C.shelf_header : '#999'
  }

  function handleClick(id, label, cx, cy) {
    const occ = occupancy[id]
    if (occ?.occupied && !selected.includes(id)) {
      setTooltip({ id, x: cx, y: cy, ...occ })
      return
    }
    setTooltip(null)
    onToggle(id, label, 'MPF')
  }

  // Shelves: 4 shelves x 3 rows
  const shelves = [
    { id: 'MPF-SD', label: 'Shelf D', hx: 40, hy: 30, rows: [
      { id: 'MPF-SD-R1', label: 'Shelf D · Row 1', x: 40, y: 50, w: 140, h: 26 },
      { id: 'MPF-SD-R2', label: 'Shelf D · Row 2', x: 40, y: 78, w: 140, h: 26 },
      { id: 'MPF-SD-R3', label: 'Shelf D · Row 3', x: 40, y: 106, w: 140, h: 26 },
    ]},
    { id: 'MPF-SC', label: 'Shelf C', hx: 330, hy: 30, rows: [
      { id: 'MPF-SC-R1', label: 'Shelf C · Row 1', x: 330, y: 50, w: 140, h: 26 },
      { id: 'MPF-SC-R2', label: 'Shelf C · Row 2', x: 330, y: 78, w: 140, h: 26 },
      { id: 'MPF-SC-R3', label: 'Shelf C · Row 3', x: 330, y: 106, w: 140, h: 26 },
    ]},
    { id: 'MPF-SB', label: 'Shelf B', hx: 330, hy: 200, rows: [
      { id: 'MPF-SB-R1', label: 'Shelf B · Row 1', x: 330, y: 220, w: 140, h: 26 },
      { id: 'MPF-SB-R2', label: 'Shelf B · Row 2', x: 330, y: 248, w: 140, h: 26 },
      { id: 'MPF-SB-R3', label: 'Shelf B · Row 3', x: 330, y: 276, w: 140, h: 26 },
    ]},
    { id: 'MPF-SA', label: 'Shelf A', hx: 330, hy: 360, rows: [
      { id: 'MPF-SA-R1', label: 'Shelf A · Row 1', x: 330, y: 380, w: 140, h: 26 },
      { id: 'MPF-SA-R2', label: 'Shelf A · Row 2', x: 330, y: 408, w: 140, h: 26 },
      { id: 'MPF-SA-R3', label: 'Shelf A · Row 3', x: 330, y: 436, w: 140, h: 26 },
    ]},
  ]

  // Floor pallets
  const palletGroups = [
    // Left column
    [34,35,36].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:178, w:32, h:24 })),
    [28,29,30].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:215, w:32, h:24 })),
    [22,23,24].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:252, w:32, h:24 })),
    [16,17,18].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:300, w:32, h:24 })),
    [10,11,12].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:337, w:32, h:24 })),
    [4,5,6].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:40+i*37, y:374, w:32, h:24 })),
    // Right column
    [31,32,33].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:178, w:32, h:24 })),
    [25,26,27].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:215, w:32, h:24 })),
    [19,20,21].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:252, w:32, h:24 })),
    [13,14,15].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:300, w:32, h:24 })),
    [7,8,9].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:337, w:32, h:24 })),
    [1,2,3].map((n,i) => ({ id:`MPF-P${n}`, label:`Pallet ${n}`, x:190+i*37, y:374, w:32, h:24 })),
  ].flat()

  return (
    <svg viewBox="0 0 540 500" width="100%" style={{ minWidth: 340, maxWidth: 520, display: 'block', margin: '0 auto' }}
      onClick={e => { if (e.target.tagName === 'svg') setTooltip(null) }}>
      <rect x="2" y="2" width="536" height="496" fill={C.floor} stroke="#555" strokeWidth="2" rx="2"/>

      {/* Shelves */}
      {shelves.map(shelf => (
        <g key={shelf.id}>
          <rect x={shelf.hx} y={shelf.hy} width={140} height={18} fill={C.shelf_header} rx="2"/>
          <text x={shelf.hx + 70} y={shelf.hy + 13} textAnchor="middle" fontSize={11} fontFamily="sans-serif" fill="#fff" fontWeight="500">{shelf.label}</text>
          {shelf.rows.map(row => {
            const occ = occupancy[row.id]
            const cx = row.x + row.w / 2
            const cy = row.y + row.h / 2
            return (
              <g key={row.id} style={{ cursor: occ?.occupied && !selected.includes(row.id) ? 'not-allowed' : 'pointer' }}
                onClick={() => handleClick(row.id, row.label, cx, cy)}>
                <rect x={row.x} y={row.y} width={row.w} height={row.h} rx="2"
                  fill={getFill(row.id, true)} stroke={getStroke(row.id, true)} strokeWidth={selected.includes(row.id) ? 2 : 1}/>
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontFamily="sans-serif"
                  fill={occ?.occupied && !selected.includes(row.id) ? '#fff' : '#3d2a00'}>
                  {row.label.split('·')[1]?.trim() || row.label}
                </text>
              </g>
            )
          })}
        </g>
      ))}

      {/* Floor pallets */}
      {palletGroups.map(p => {
        const occ = occupancy[p.id]
        const cx = p.x + p.w / 2
        const cy = p.y + p.h / 2
        return (
          <g key={p.id} style={{ cursor: occ?.occupied && !selected.includes(p.id) ? 'not-allowed' : 'pointer' }}
            onClick={() => handleClick(p.id, p.label, cx, cy)}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2"
              fill={getFill(p.id, false)} stroke={getStroke(p.id, false)} strokeWidth={selected.includes(p.id) ? 2 : 1}/>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontFamily="sans-serif"
              fill={occ?.occupied && !selected.includes(p.id) ? '#fff' : '#333'}>
              {p.label.replace('Pallet ', '')}
            </text>
          </g>
        )
      })}

      {/* Center label */}
      <text x="230" y="155" textAnchor="middle" fontSize={11} fontFamily="sans-serif" fill="#f5e0d0" fontWeight="500">0101 · N/A</text>

      {/* Doors */}
      <rect x="155" y="490" width="60" height="6" fill="#777" rx="1"/>
      <rect x="290" y="490" width="60" height="6" fill="#777" rx="1"/>

      {tooltip && <Tooltip x={tooltip.x} y={tooltip.y} info={tooltip} onClose={() => setTooltip(null)} />}
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════
// STORAGE MAP (Nov 2026) — a drawn layout, the ICT-Lab way
// ══════════════════════════════════════════════════════════════
// A floor plan is a storage_layouts row: rooms and spots drawn on a grid,
// optionally over a photo of the floor plan (the old photo-and-zones plans
// were converted that way — each zone a room holding one floor spot with
// the zone's id, so what was stored there is still found). Coordinates are
// percent of the map, so it draws the same at any size.
// SQL: storage_layouts_setup.sql.
//
// Spots are racks with shelves, a pallet, or an area of floor. Shelves are
// lettered from the TOP (A = top shelf); a rack spot may divide every shelf
// into places, named A1, A2, A3. Place ids, the same as ICT-Lab's:
//   <spot>-R<rack>-S<shelf>           whole shelf   (placesPerShelf = 1)
//   <spot>-R<rack>-S<shelf>-P<place>  one place     (placesPerShelf > 1)
// One place holds many materials (one storage_locations row each) and has
// one owner: whoever stored there first.
export const shelfLetter = n => String.fromCharCode(64 + Number(n))
const RACK_SLOT = /^(.+)-R(\d+)-S(\d+)(?:-P(\d+))?$/
const placeCount = spot => Math.max(1, parseInt(spot?.placesPerShelf) || 1)
function slotName(spot, r, sh, pl) {
  const rack = spot?.rackNames?.[r - 1] || `Rack ${r}`
  return pl ? `${rack} · ${shelfLetter(sh)}${pl}` : `${rack} · Shelf ${shelfLetter(sh)}`
}
// The spot a place id belongs to (a pallet or floor spot is its own place)
const spotOf = id => id?.match(RACK_SLOT)?.[1] || id
const APP_PROJECTS_URL = 'https://labhive.app/app?screen=projects'
const MAP_W = 1000
const DEFAULT_ASPECT = 1.6667
const newId = prefix => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
function spotSummary(sp) {
  if (sp.type !== 'racks') return sp.type === 'pallet' ? 'pallet' : 'floor'
  const n = sp.rackNames?.length || 1
  return `${n} rack${n !== 1 ? 's' : ''} · A–${shelfLetter(sp.shelvesPerRack || 1)}`
}

// Same downscale the old floor plan editor used: a photo is kept as a JPEG
// data URL, at most 2400px on its long side.
async function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── The map ───────────────────────────────────────────────────
// View: click a spot to open it. Edit (lab managers / admins): tool 'room'
// drags out a new room, tool 'spot' clicks a spot into a room; without a
// tool, drag a room or spot to move it (a room takes its spots along), drag
// a room's corner to resize it, click either to rename or remove it.
function LayoutMap({ layout, aspect, spotState, editing, tool, onToolDone, onChange, onSpotView, onSetUp, spotHasItems }) {
  const svgRef = useRef(null)
  const H = MAP_W / aspect
  const [drag, setDrag] = useState(null)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rooms = layout.rooms || []
  const spots = layout.spots || []
  const X = v => v / 100 * MAP_W
  const Y = v => v / 100 * H

  useEffect(() => { setForm(null); setFormError('') }, [layout.id, editing])

  function pt(e) {
    const svg = svgRef.current
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(svg.getScreenCTM().inverse())
    return { x: clamp(q.x / MAP_W * 100, 0, 100), y: clamp(q.y / H * 100, 0, 100) }
  }
  const roomAt = (x, y) => [...rooms].reverse().find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)

  function openForm(next) { setForm(next); setFormError(''); setConfirmDelete(false) }
  function openSpotForm(sp) {
    openForm(sp.id ? { kind: 'spot', ...sp } : {
      kind: 'spot', id: null, room_id: sp.room_id, x: sp.x, y: sp.y, name: '',
      type: 'racks', rackNames: ['Rack 1'], shelvesPerRack: 4, placesPerShelf: 1,
    })
  }

  function down(e, kind, id) {
    if (!editing || form) return
    e.stopPropagation()
    const p = pt(e)
    if (tool === 'spot') {
      const room = kind === 'room' ? rooms.find(r => r.id === id) : roomAt(p.x, p.y)
      if (room) { openSpotForm({ room_id: room.id, x: p.x, y: p.y }); onToolDone() }
      return
    }
    // With "+ Add room" on, a press anywhere starts drawing a new room
    if (tool === 'room') kind = 'bg'
    else if (kind === 'bg') return
    svgRef.current.setPointerCapture?.(e.pointerId)
    const orig = kind === 'spot' ? spots.find(s => s.id === id) : rooms.find(r => r.id === id)
    setDrag({ kind: kind === 'bg' ? 'draw' : kind, id, x0: p.x, y0: p.y, cur: p, orig, moved: false })
  }
  function move(e) {
    if (!drag) return
    const p = pt(e)
    setDrag(d => ({ ...d, cur: p, moved: d.moved || Math.abs(p.x - d.x0) > 0.6 || Math.abs(p.y - d.y0) > 0.6 }))
  }
  function up() {
    if (!drag) return
    const d = drag
    setDrag(null)
    const dx = d.cur.x - d.x0, dy = d.cur.y - d.y0
    if (d.kind === 'draw') {
      const w = Math.abs(dx), h = Math.abs(dy)
      if (w > 3 && h > 3) { openForm({ kind: 'room', id: null, name: '', x: Math.min(d.x0, d.cur.x), y: Math.min(d.y0, d.cur.y), w, h }); onToolDone() }
      return
    }
    if (!d.moved) {
      if (d.kind === 'spot') openSpotForm(d.orig)
      else if (d.kind === 'room') openForm({ kind: 'room', ...d.orig })
      return
    }
    if (d.kind === 'spot') {
      const x = clamp(d.orig.x + dx, 0, 100), y = clamp(d.orig.y + dy, 0, 100)
      onChange({ spots: spots.map(s => s.id === d.id ? { ...s, x, y, room_id: roomAt(x, y)?.id || s.room_id } : s) })
    } else if (d.kind === 'room') {
      const mx = clamp(dx, -d.orig.x, 100 - d.orig.x - d.orig.w), my = clamp(dy, -d.orig.y, 100 - d.orig.y - d.orig.h)
      onChange({
        rooms: rooms.map(r => r.id === d.id ? { ...r, x: r.x + mx, y: r.y + my } : r),
        spots: spots.map(s => s.room_id === d.id ? { ...s, x: s.x + mx, y: s.y + my } : s),
      })
    } else if (d.kind === 'resize') {
      onChange({ rooms: rooms.map(r => r.id === d.id ? { ...r, w: clamp(d.orig.w + dx, 4, 100 - r.x), h: clamp(d.orig.h + dy, 4, 100 - r.y) } : r) })
    }
  }

  // Where a room or spot is drawn while it is being dragged
  function liveRoom(r) {
    if (!drag?.moved || drag.id !== r.id) return r
    const dx = drag.cur.x - drag.x0, dy = drag.cur.y - drag.y0
    if (drag.kind === 'room') return { ...r, x: clamp(r.x + dx, 0, 100 - r.w), y: clamp(r.y + dy, 0, 100 - r.h) }
    if (drag.kind === 'resize') return { ...r, w: clamp(drag.orig.w + dx, 4, 100 - r.x), h: clamp(drag.orig.h + dy, 4, 100 - r.y) }
    return r
  }
  function liveSpot(s) {
    if (!drag?.moved) return s
    const dx = drag.cur.x - drag.x0, dy = drag.cur.y - drag.y0
    if (drag.kind === 'spot' && drag.id === s.id) return { ...s, x: clamp(s.x + dx, 0, 100), y: clamp(s.y + dy, 0, 100) }
    if (drag.kind === 'room' && drag.id === s.room_id) {
      const r = rooms.find(x => x.id === s.room_id)
      return { ...s, x: s.x + clamp(dx, -r.x, 100 - r.x - r.w), y: s.y + clamp(dy, -r.y, 100 - r.y - r.h) }
    }
    return s
  }

  function saveForm() {
    const name = (form.name || '').trim()
    if (!name) { setFormError('Give it a name.'); return }
    if (form.kind === 'room') {
      const room = { id: form.id || newId('room'), name, x: form.x, y: form.y, w: form.w, h: form.h }
      onChange({ rooms: form.id ? rooms.map(r => r.id === form.id ? room : r) : [...rooms, room] })
    } else {
      const base = { id: form.id || newId('spot'), room_id: form.room_id, name, x: form.x, y: form.y }
      let spot
      if (form.id) {
        // Shelves of an existing spot change through Set up shelves, which
        // re-files what is stored there
        const old = spots.find(s => s.id === form.id)
        spot = { ...old, ...base }
      } else if (form.type === 'racks') {
        const count = clamp(form.rackNames.length, 1, 12)
        spot = { ...base, type: 'racks',
          rackNames: form.rackNames.slice(0, count).map((n, i) => n.trim() || `Rack ${i + 1}`),
          shelvesPerRack: clamp(parseInt(form.shelvesPerRack) || 1, 1, 26),
          placesPerShelf: clamp(parseInt(form.placesPerShelf) || 1, 1, 12) }
      } else spot = { ...base, type: form.type }
      onChange({ spots: form.id ? spots.map(s => s.id === form.id ? spot : s) : [...spots, spot] })
    }
    setForm(null)
  }

  function removeFromForm() {
    if (form.kind === 'spot') {
      if (spotHasItems(form.id)) { setFormError('Materials are stored in this spot. Move them first, then remove it.'); return }
      onChange({ spots: spots.filter(s => s.id !== form.id) })
    } else {
      const inside = spots.filter(s => s.room_id === form.id)
      if (inside.some(s => spotHasItems(s.id))) { setFormError('Materials are stored in a spot in this room. Move them first, then remove it.'); return }
      if (inside.length && !confirmDelete) { setConfirmDelete(true); return }
      onChange({ rooms: rooms.filter(r => r.id !== form.id), spots: spots.filter(s => s.room_id !== form.id) })
    }
    setForm(null)
  }

  const draw = drag?.kind === 'draw' ? {
    x: Math.min(drag.x0, drag.cur.x), y: Math.min(drag.y0, drag.cur.y),
    w: Math.abs(drag.cur.x - drag.x0), h: Math.abs(drag.cur.y - drag.y0),
  } : null
  const hasPhoto = !!layout.image_url
  const editStroke = '#534AB7'

  return (
    <div>
      <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${H}`} style={{ display: 'block', width: '100%', minWidth: 560, height: 'auto', touchAction: editing ? 'none' : 'auto', userSelect: 'none', cursor: editing && tool ? 'crosshair' : 'default' }}
        onPointerDown={e => down(e, 'bg')} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
        role="img" aria-label={`${layout.name}: ${rooms.length} rooms, ${spots.length} storage spots`}>
        <defs>
          <pattern id={`grid-${layout.id}`} width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" style={{ stroke: 'var(--border)' }} strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={MAP_W} height={H} style={{ fill: 'var(--surface2)' }} />
        {hasPhoto
          ? <image href={layout.image_url} x="0" y="0" width={MAP_W} height={H} preserveAspectRatio="none" opacity={editing ? 0.55 : 0.4} />
          : <rect x="0" y="0" width={MAP_W} height={H} fill={`url(#grid-${layout.id})`} />}

        {rooms.map(r0 => {
          const r = liveRoom(r0)
          const n = spots.filter(s => s.room_id === r.id).length
          return (
            <g key={r.id} onPointerDown={e => down(e, 'room', r.id)} style={{ cursor: editing ? (tool ? 'crosshair' : 'move') : 'default' }}>
              <rect x={X(r.x)} y={Y(r.y)} width={X(r.w)} height={Y(r.h)} rx="3"
                style={{ fill: hasPhoto ? 'rgba(255,255,255,0.35)' : 'var(--surface)', stroke: editing ? editStroke : '#6b736e' }}
                strokeWidth={editing ? 1.8 : 1.6} strokeDasharray={editing ? '7 5' : undefined} />
              <text x={X(r.x) + 10} y={Y(r.y) + 20} fontSize="14" fontWeight="700" fontFamily="var(--sans)" style={{ fill: 'var(--text2)', pointerEvents: 'none' }}>{r.name}</text>
              <text x={X(r.x) + 10} y={Y(r.y) + 35} fontSize="10.5" fontFamily="var(--mono)" style={{ fill: 'var(--text3)', pointerEvents: 'none' }}>{n} spot{n !== 1 ? 's' : ''}</text>
              {editing && !tool && (
                <rect x={X(r.x + r.w) - 7} y={Y(r.y + r.h) - 7} width="12" height="12" rx="2" style={{ fill: 'var(--surface)', stroke: editStroke, cursor: 'nwse-resize' }} strokeWidth="1.6"
                  onPointerDown={e => down(e, 'resize', r.id)} />
              )}
            </g>
          )
        })}

        {spots.map(s0 => {
          const s = liveSpot(s0)
          const st = spotState(s.id)
          const w = clamp(s.name.length * 7.4 + 44, 110, 230)
          const cx = X(s.x), cy = Y(s.y)
          const fill = st.here ? 'var(--accent-light)' : st.mine ? '#EEEDFE' : st.count ? '#E1F5EE' : 'var(--surface)'
          const stroke = st.mine && !st.here ? '#534AB7' : 'var(--accent)'
          return (
            <g key={s.id} style={{ cursor: editing ? (tool ? 'crosshair' : 'move') : 'pointer' }}
              onPointerDown={e => down(e, 'spot', s.id)}
              onClick={() => { if (!editing) onSpotView(s.id) }}
              tabIndex={editing ? -1 : 0} role={editing ? undefined : 'button'} aria-label={editing ? undefined : `Open ${s.name}`}
              onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSpotView(s.id) } }}>
              <rect x={cx - w / 2} y={cy - 19} width={w} height="38" rx="19" style={{ fill, stroke }} strokeWidth={st.here ? 3 : 1.6} />
              <text x={cx} y={cy - 2} textAnchor="middle" fontSize="12.5" fontWeight="700" fontFamily="var(--sans)" style={{ fill: 'var(--text)', pointerEvents: 'none' }}>{s.name}</text>
              <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" style={{ fill: 'var(--text3)', pointerEvents: 'none' }}>{spotSummary(s)}</text>
              {st.count > 0 && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={cx + w / 2 - 4} cy={cy - 17} r="10" fill="#c84b2f" />
                  <text x={cx + w / 2 - 4} y={cy - 13.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="var(--sans)">{st.count}</text>
                </g>
              )}
            </g>
          )
        })}

        {draw && <rect x={X(draw.x)} y={Y(draw.y)} width={X(draw.w)} height={Y(draw.h)} rx="3" fill="rgba(83,74,183,0.12)" stroke={editStroke} strokeWidth="1.8" strokeDasharray="7 5" />}
        {!rooms.length && !draw && (
          <text x={MAP_W / 2} y={H / 2} textAnchor="middle" fontSize="15" fontFamily="var(--sans)" style={{ fill: 'var(--text3)', pointerEvents: 'none' }}>
            {editing ? 'Press “+ Add room”, then drag on the map to draw a room.' : 'No rooms on this floor plan yet.'}
          </text>
        )}
      </svg>

      {/* Add / edit a room or spot */}
      {form && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--surface2)', display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {form.kind === 'room' ? (form.id ? 'Room' : 'New room') : form.id ? 'Spot' : `Place spot in ${rooms.find(r => r.id === form.room_id)?.name || 'room'}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{form.kind === 'room' ? 'Room name' : 'Spot name'}</label>
              <input value={form.name} autoFocus maxLength={40} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={form.kind === 'room' ? 'e.g. Binder Lab' : 'e.g. Mix Shelf M1'} onKeyDown={e => e.key === 'Enter' && saveForm()} />
            </div>
            {form.kind === 'spot' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Room</label>
                <select value={form.room_id || ''} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {form.kind === 'spot' && !form.id && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['floor', 'Floor (one place)'], ['pallet', 'Pallet (one place)'], ['racks', 'Racks with shelves']].map(([k, l]) => (
                  <button key={k} type="button" className={'filter-btn' + (form.type === k ? ' active' : '')} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>
                ))}
              </div>
              {form.type === 'racks' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>Racks</label>
                      <input type="number" min={1} max={12} value={form.rackNames.length}
                        onChange={e => { const n = clamp(parseInt(e.target.value) || 1, 1, 12); setForm(f => ({ ...f, rackNames: Array.from({ length: n }, (_, i) => f.rackNames[i] || `Rack ${i + 1}`) })) }} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}><label>Shelves per rack</label>
                      <input type="number" min={1} max={26} value={form.shelvesPerRack} onChange={e => setForm(f => ({ ...f, shelvesPerRack: e.target.value }))} />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}><label>Places per shelf</label>
                      <input type="number" min={1} max={12} value={form.placesPerShelf} onChange={e => setForm(f => ({ ...f, placesPerShelf: e.target.value }))} />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Rack names</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                      {form.rackNames.map((n, i) => (
                        <input key={i} value={n} onChange={e => setForm(f => { const r = [...f.rackNames]; r[i] = e.target.value; return { ...f, rackNames: r } })} />
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const sh = clamp(parseInt(form.shelvesPerRack) || 1, 1, 26), pl = clamp(parseInt(form.placesPerShelf) || 1, 1, 12)
                    return (
                      <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                        {form.rackNames.length * sh * pl} places · shelves A–{shelfLetter(sh)} (A is the top){pl > 1 ? ` · ${shelfLetter(1)}1 … ${shelfLetter(sh)}${pl}` : ' · whole shelves'}
                      </div>
                    )
                  })()}
                </>
              )}
            </>
          )}
          {form.kind === 'spot' && form.id && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {spotSummary(form)}. Racks, shelves and places change in <button type="button" className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => { const id = form.id; setForm(null); onSetUp(id) }}>🛠 Set up shelves</button>, which keeps what is stored there.
            </div>
          )}
          {formError && <div style={{ fontSize: 13, color: '#c84b2f', background: '#fdecea', borderRadius: 8, padding: '8px 10px' }}>{formError}</div>}
          {confirmDelete && <div style={{ fontSize: 13, color: '#7a4a00', background: '#fff7e6', borderRadius: 8, padding: '8px 10px' }}>This removes the room and its {spots.filter(s => s.room_id === form.id).length} empty spot(s). Press Remove again to confirm.</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={saveForm}>{form.id ? 'Save changes' : form.kind === 'room' ? 'Add room' : 'Add spot'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setForm(null)}>Cancel</button>
            {form.id && <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto', color: '#c84b2f', borderColor: '#e6a5a4' }} onClick={removeFromForm}>Remove {form.kind}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN FLOOR PLAN PICKER
// ══════════════════════════════════════════════════════════════
export function formatLocation(loc) {
  if (!loc) return ''
  if (loc.location && loc.detail && loc.location !== loc.detail) return `${loc.location} — ${loc.detail}`
  return loc.detail || loc.location || ''
}

// allowLayoutEdit: opened to manage the map (Admin → Floor Plan), starts in
// Edit layout. inline: drawn in the page instead of as a popup.
export default function FloorPlanPicker({ projectId, projectName, materialId, materialType, currentLocations = [], onConfirm = () => {}, onClose = () => {}, viewOnly = false, allowLayoutEdit = false, inline = false }) {
  const { session, toast } = useAppStore()
  const [layouts, setLayouts] = useState([])
  const [facility, setFacility] = useState(null)   // a layout id, or 'ICT' / 'MPF'
  const [occupancy, setOccupancy] = useState({})
  const [selected, setSelected] = useState(currentLocations.map(l => l.location_id).filter(Boolean))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editLayout, setEditLayout] = useState(!!allowLayoutEdit)
  const [tool, setTool] = useState(null)            // 'room' | 'spot' while placing one
  const [newPlan, setNewPlan] = useState(null)      // name being typed for a new floor plan
  const [planMenu, setPlanMenu] = useState(null)    // { name, confirmDelete } for the open floor plan
  const [aspects, setAspects] = useState({})        // layout id → width / height of its photo
  const photoInput = useRef(null)
  const [viewSpotId, setViewSpotId] = useState('')
  const [focusId, setFocusId] = useState('')
  const [openShelf, setOpenShelf] = useState('')
  const [moveItem, setMoveItem] = useState(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupSpotId, setSetupSpotId] = useState('')
  const [setupDraft, setSetupDraft] = useState(null)
  const [setupError, setSetupError] = useState('')
  const [busy, setBusy] = useState(false)
  // Every users row of the signed-in person (one login can hold a lab-user
  // and a lab-manager row): a place stored from either is theirs.
  const [myIds, setMyIds] = useState(session?.userId ? [String(session.userId)] : [])
  const canEdit = !!session
  const isSolo = session?.loginMode === 'solo'
  const isICTOrg = session?.organizationId === '5bab5b33-fff9-4a4a-b617-3dac179f9678'
  // Lab managers / admins store anywhere, move anyone's material, set up the
  // shelves and edit the map; lab users store in free places or their own.
  const isManagerOrAdmin = session?.role === 'admin' || session?.role === 'user' || session?.userId === null
  const canEditLayout = !viewOnly && (isManagerOrAdmin || isSolo)
  // The window picks a place for THIS material only when opened from one
  const picking = !viewOnly && canEdit && !!materialId && !allowLayoutEdit

  useEffect(() => { loadAll() }, [])

  const orgFilter = q => isSolo ? q.is('organization_id', null) : q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')

  async function loadAll() {
    setLoading(true)
    if (session?.email && !isSolo) {
      sb.from('users').select('id').ilike('email', session.email).then(({ data }) => {
        if (data?.length) setMyIds([...new Set([String(session.userId), ...data.map(u => String(u.id))])])
      }, () => {})
    }
    let lq = sb.from('storage_layouts').select('*').order('sort_order').order('created_at')
    lq = isSolo ? lq.is('organization_id', null).eq('solo_owner_id', session?.userId) : lq.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const [{ data: locData }, { data: lays, error: layErr }] = await Promise.all([orgFilter(sb.from('storage_locations').select('*')), lq])
    if (layErr) setLoadError(/storage_layouts|schema cache/i.test(layErr.message) ? 'The storage map needs storage_layouts_setup.sql to be run in Supabase first.' : 'Could not load the floor plans: ' + layErr.message)
    setOccupancy(buildOccupancy(locData))
    const list = lays || []
    setLayouts(list)
    // Open the floor plan this material is stored on, else the first one
    const here = list.find(l => (l.spots || []).some(s => selected.some(id => spotOf(id) === s.id)))
    setFacility(here?.id || list[0]?.id || (isICTOrg ? 'ICT' : null))
    setLoading(false)
  }

  // One storage row per material, grouped by place. The first one stored
  // there names the owner.
  function buildOccupancy(locData) {
    const map = {}
    ;(locData || []).forEach(loc => {
      const e = map[loc.location_id] || (map[loc.location_id] = { occupied: false, items: [], db_id: loc.id })
      if (!loc.occupied) return
      e.occupied = true
      e.items.push({
        row_id: loc.id, material_id: loc.material_id, project_id: loc.project_id,
        project_name: loc.project_name, material_type: loc.material_type,
        occupied_by: loc.occupied_by, occupied_by_id: loc.occupied_by_id || null, occupied_at: loc.occupied_at,
      })
    })
    Object.values(map).forEach(e => {
      if (!e.items.length) return
      e.items.sort((x, y) => String(x.occupied_at || '').localeCompare(String(y.occupied_at || '')))
      const first = e.items[0]
      e.project_name = first.project_name
      e.material_type = first.material_type
      e.occupied_by = first.occupied_by
      e.owner_id = first.occupied_by_id
    })
    return map
  }
  async function reloadOccupancy() {
    const { data } = await orgFilter(sb.from('storage_locations').select('*'))
    setOccupancy(buildOccupancy(data))
  }

  function isMine(occ) {
    if (!occ?.occupied) return false
    if (occ.owner_id) return myIds.includes(String(occ.owner_id))
    return !!occ.occupied_by && occ.occupied_by === session?.username
  }
  // 'free' | 'here' (this material is there) | 'mine' | 'taken'
  function placeState(id) {
    const occ = occupancy[id]
    if (selected.includes(id)) return 'here'
    if (!occ?.occupied) return 'free'
    return isMine(occ) ? 'mine' : 'taken'
  }
  // A spot on the map: how many materials, and whether this one / yours are in it
  function spotState(spotId) {
    let count = 0, mine = false
    Object.entries(occupancy).forEach(([id, occ]) => {
      if (!occ.occupied || spotOf(id) !== spotId) return
      count += occ.items.length
      if (isMine(occ)) mine = true
    })
    return { count, mine, here: selected.some(id => spotOf(id) === spotId) }
  }
  const spotHasItems = id => spotState(id).count > 0

  const allSpots = layouts.flatMap(l => (l.spots || []).map(s => ({ ...s, _layout: l.id })))
  function getLocationDetail(id, lays = layouts) {
    const m = id.match(RACK_SLOT)
    const sid = m ? m[1] : id
    for (const l of lays) {
      const spot = (l.spots || []).find(s => s.id === sid)
      if (!spot) continue
      const room = (l.rooms || []).find(r => r.id === spot.room_id)
      const detail = m ? `${spot.name} · ${slotName(spot, +m[2], +m[3], m[4] ? +m[4] : null)}` : spot.name
      return { location: room ? `${l.name} · ${room.name}` : l.name, detail, facility: l.name }
    }
    if (isICTOrg) return { location: id.startsWith('MPF') ? 'MPF' : 'ICT Building', detail: id, facility: id.startsWith('MPF') ? 'MPF' : 'ICT' }
    return { location: '', detail: id, facility: '' }
  }

  // ── Floor plans (storage_layouts rows) ──
  const layout = layouts.find(l => l.id === facility) || null
  const aspectOf = l => Number(l?.aspect) || aspects[l?.id] || DEFAULT_ASPECT
  // A converted or uploaded photo with no aspect: take it from the picture
  useEffect(() => {
    layouts.forEach(l => {
      if (!l.image_url || Number(l.aspect) || aspects[l.id]) return
      const img = new Image()
      img.onload = () => setAspects(a => ({ ...a, [l.id]: img.naturalWidth / img.naturalHeight || DEFAULT_ASPECT }))
      img.src = l.image_url
    })
  }, [layouts])

  async function saveLayout(id, patch) {
    const before = layouts
    setLayouts(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
    const { data, error } = await sb.from('storage_layouts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id')
    if (error || !data?.length) {
      setLayouts(before)
      toast('The floor plan was not saved' + (error ? ': ' + error.message : ' — you may not have permission to change it.'), true)
      return false
    }
    return true
  }
  async function createLayout() {
    const name = (newPlan || '').trim()
    if (!name) return
    const row = { name, sort_order: layouts.length, rooms: [], spots: [], aspect: DEFAULT_ASPECT,
      ...(isSolo ? { organization_id: null, solo_owner_id: session?.userId } : { organization_id: session?.organizationId }) }
    const { data, error } = await sb.from('storage_layouts').insert(row).select().single()
    if (error) { toast('Could not add the floor plan: ' + error.message, true); return }
    setLayouts(ls => [...ls, data])
    setFacility(data.id)
    setNewPlan(null)
    setTool('room')
  }
  async function deleteLayout() {
    if (!layout) return
    if ((layout.spots || []).some(s => spotHasItems(s.id))) { toast('Materials are stored on this floor plan. Move them first, then remove it.', true); return }
    const { data, error } = await sb.from('storage_layouts').delete().eq('id', layout.id).select('id')
    if (error || !data?.length) { toast('Could not remove the floor plan' + (error ? ': ' + error.message : '.'), true); return }
    const rest = layouts.filter(l => l.id !== layout.id)
    setLayouts(rest)
    setFacility(rest[0]?.id || (isICTOrg ? 'ICT' : null))
    setPlanMenu(null)
  }
  async function choosePhoto(file) {
    if (!file || !layout) return
    if (!file.type.startsWith('image/')) { toast('Choose an image file.', true); return }
    if (file.size > 10 * 1024 * 1024) { toast('Image must be under 10 MB.', true); return }
    try {
      const url = await readPhoto(file)
      await saveLayout(layout.id, { image_url: url, aspect: null })
    } catch { toast('Could not read that image.', true) }
  }

  // ── Store / move ──
  // occupied_by_id may be missing before the SQL runs: store without it
  async function writeRow(kind, payload, rowId) {
    const run = body => kind === 'update'
      ? sb.from('storage_locations').update(body).eq('id', rowId)
      : sb.from('storage_locations').insert(body)
    let { error } = await run(payload)
    if (error && /occupied_by_id/.test(error.message || '')) {
      const { occupied_by_id, ...rest } = payload
      ;({ error } = await run(rest))
    }
    if (error) throw error
  }

  async function saveLocations(idsArray, { keepOpen = false } = {}) {
    if (!canEdit) { onConfirm([]); onClose(); return }
    setSaving(true)
    try {
      const orgId = session?.organizationId || null
      const { data: existing } = await sb.from('storage_locations').select('*').eq('material_id', materialId)
      const existingIds = (existing || []).map(e => e.location_id)
      // Release only THIS material's row: a place holds other materials too
      for (const row of (existing || []).filter(e => !idsArray.includes(e.location_id))) {
        await sb.from('storage_locations').update({
          occupied: false, project_id: null, material_id: null, project_name: null, material_type: null,
          occupied_at: null, occupied_by: null,
        }).eq('id', row.id)
      }
      for (const id of idsArray.filter(id => !existingIds.includes(id))) {
        const det = getLocationDetail(id)
        const { data: freeRows } = await orgFilter(sb.from('storage_locations').select('id').eq('location_id', id).eq('occupied', false)).limit(1)
        const payload = {
          location_id: id, location_label: det.detail, facility: det.facility, occupied: true,
          project_id: projectId, material_id: materialId, project_name: projectName, material_type: materialType,
          occupied_at: new Date().toISOString(), occupied_by: session?.username, occupied_by_id: session?.userId || null,
          organization_id: isSolo ? null : orgId,
        }
        if (freeRows?.length) await writeRow('update', payload, freeRows[0].id)
        else await writeRow('insert', payload)
      }
      onConfirm(idsArray.map(id => { const det = getLocationDetail(id); return { location_id: id, location: det.location, detail: det.detail } }))
      if (keepOpen) { setSelected(idsArray); await reloadOccupancy() }
      else onClose()
    } catch (e) {
      toast('The storage location could not be saved: ' + (e?.message || e), true)
    }
    setSaving(false)
  }
  function pickLocation(id) { if (canEdit) saveLocations([id]) }
  async function unstore(id) { setFocusId(''); await saveLocations(selected.filter(x => x !== id), { keepOpen: true }) }

  // A lab manager moves someone's material to another place
  async function moveMaterial(item, toId) {
    setBusy(true)
    try {
      const fromLabel = getLocationDetail(item.from_id).detail
      const det = getLocationDetail(toId)
      const { data: moved, error } = await sb.from('storage_locations')
        .update({ location_id: toId, location_label: det.detail, facility: det.facility }).eq('id', item.row_id).select('id')
      if (error) throw error
      if (!moved?.length) throw new Error('nothing was changed — the material may have been moved already')
      let materialName = item.material_type || 'material'
      if (item.material_id) {
        const { data: m } = await sb.from('project_materials').select('id, name, locations').eq('id', item.material_id).maybeSingle()
        if (m) {
          materialName = m.name || materialName
          const locs = (m.locations || []).map(l => l.location_id === item.from_id ? { location_id: toId, location: det.location, detail: det.detail } : l)
          await sb.from('project_materials').update({ locations: locs }).eq('id', m.id)
        }
      }
      let ownerId = item.occupied_by_id
      if (!ownerId && item.occupied_by && session?.organizationId) {
        const { data: u } = await sb.from('users').select('id').eq('name', item.occupied_by)
          .eq('organization_id', session.organizationId).eq('is_active', true).limit(1)
        ownerId = u?.[0]?.id || null
      }
      if (ownerId && String(ownerId) !== String(session?.userId)) {
        await sendTaskNotification(ownerId, 'storage_moved', `📦 Your material was moved: ${materialName}`,
          `${session?.username || 'A lab manager'} moved ${materialName}${item.project_name ? ` (${item.project_name})` : ''} from ${fromLabel} to ${det.detail}.`,
          null, { label: 'Open Project Workspace →', url: APP_PROJECTS_URL })
      }
      setMoveItem(null)
      setFocusId(toId)
      await reloadOccupancy()
    } catch (e) {
      toast('The material could not be moved: ' + (e?.message || e), true)
    }
    setBusy(false)
  }

  // ── Set up shelves (lab managers / admins) ──
  function openSetup(spotId = '') { setSetupOpen(true); setSetupError(''); chooseSetupSpot(spotId) }
  function chooseSetupSpot(id) {
    setSetupSpotId(id)
    setSetupError('')
    const sp = allSpots.find(x => x.id === id)
    setSetupDraft(sp ? {
      type: sp.type || 'pallet',
      rackNames: sp.rackNames?.length ? [...sp.rackNames] : ['Rack 1'],
      shelvesPerRack: sp.shelvesPerRack || 1,
      placesPerShelf: placeCount(sp),
    } : null)
  }
  function setDraftRackCount(n) {
    const count = clamp(parseInt(n) || 1, 1, 12)
    setSetupDraft(d => ({ ...d, rackNames: Array.from({ length: count }, (_, i) => d.rackNames[i] || `Rack ${i + 1}`) }))
  }
  // Where a stored row goes when its spot's layout changes, or null if its
  // place would disappear. Whole shelf → place 1 when places are added;
  // place 1 → whole shelf when they are removed.
  function remapSlot(id, spot, next) {
    if (id === spot.id) return next.type === 'racks' ? null : id
    const m = id.match(RACK_SLOT)
    if (!m || m[1] !== spot.id || next.type !== 'racks') return null
    const r = +m[2], sh = +m[3], pl = m[4] ? +m[4] : null
    if (r > next.rackNames.length || sh > next.shelvesPerRack) return null
    const base = `${spot.id}-R${r}-S${sh}`
    if (next.placesPerShelf > 1) return !pl ? `${base}-P1` : pl <= next.placesPerShelf ? id : null
    return !pl || pl === 1 ? base : null
  }
  async function saveSetup() {
    const spot = allSpots.find(x => x.id === setupSpotId)
    if (!spot || !setupDraft) return
    const lay = layouts.find(l => l.id === spot._layout)
    const next = {
      type: setupDraft.type,
      rackNames: setupDraft.rackNames.map((n, i) => n.trim() || `Rack ${i + 1}`),
      shelvesPerRack: clamp(parseInt(setupDraft.shelvesPerRack) || 1, 1, 26),
      placesPerShelf: clamp(parseInt(setupDraft.placesPerShelf) || 1, 1, 12),
    }
    const { _layout, ...clean } = spot
    const nextSpot = next.type === 'racks'
      ? { ...clean, type: 'racks', rackNames: next.rackNames, shelvesPerRack: next.shelvesPerRack, placesPerShelf: next.placesPerShelf }
      : (({ rackNames, shelvesPerRack, placesPerShelf, ...rest }) => ({ ...rest, type: next.type }))(clean)
    const nextSpots = (lay.spots || []).map(x => x.id === spot.id ? nextSpot : x)
    const nextLayouts = layouts.map(l => l.id === lay.id ? { ...l, spots: nextSpots } : l)
    setBusy(true)
    setSetupError('')
    try {
      let q = sb.from('storage_locations').select('id, location_id, material_id, project_name, occupied_by')
        .eq('occupied', true).or(`location_id.eq.${spot.id},location_id.like.${spot.id}-R*`)
      q = orgFilter(q)
      const { data: rows, error } = await q
      if (error) throw error
      // Nothing stored may vanish: those materials have to move first
      const lost = (rows || []).filter(r => remapSlot(r.location_id, spot, next) === null)
      if (lost.length) {
        setSetupError('These places still hold materials and would disappear with this change: '
          + lost.map(r => `${getLocationDetail(r.location_id).detail} (${r.project_name || 'material'}, ${r.occupied_by || 'unknown'})`).join('; ')
          + '. Move those materials first, then change the layout.')
        setBusy(false)
        return
      }
      if (!(await saveLayout(lay.id, { spots: nextSpots }))) { setBusy(false); return }
      // Re-file what is stored here under the new names (A2 rather than Shelf A)
      for (const r of rows || []) {
        const newPlace = remapSlot(r.location_id, spot, next)
        if (newPlace === r.location_id) continue
        const det = getLocationDetail(newPlace, nextLayouts)
        await sb.from('storage_locations').update({ location_id: newPlace, location_label: det.detail }).eq('id', r.id)
        if (!r.material_id) continue
        const { data: m } = await sb.from('project_materials').select('id, locations').eq('id', r.material_id).maybeSingle()
        if (!m) continue
        const locs = (m.locations || []).map(l => l.location_id === r.location_id ? { location_id: newPlace, location: det.location, detail: det.detail } : l)
        await sb.from('project_materials').update({ locations: locs }).eq('id', m.id)
      }
      setSelected(sel => sel.map(id => (rows || []).some(r => r.location_id === id) ? remapSlot(id, spot, next) : id))
      await reloadOccupancy()
      setSetupOpen(false)
    } catch (e) {
      setSetupError('Could not save: ' + (e?.message || e))
    }
    setBusy(false)
  }

  const viewSpot = allSpots.find(s => s.id === viewSpotId) || null
  const tabs = [...layouts.map(l => ({ key: l.id, label: l.name })), ...(isICTOrg ? [{ key: 'ICT', label: 'ICT Building' }, { key: 'MPF', label: 'MPF' }] : [])]
  const pillStyle = on => ({ fontFamily: 'var(--sans)', fontSize: 13, padding: '6px 14px', borderRadius: 99, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#fff' : 'var(--text2)', whiteSpace: 'nowrap' })

  const panel = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: inline ? 'none' : 980, border: '1px solid var(--border)', marginTop: inline ? 0 : 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{allowLayoutEdit ? '🗺️ Storage map' : viewOnly ? '🗺️ Floor Map — Storage Locations' : 'Select storage location'}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {editLayout ? 'Draw rooms, place storage spots, drag to move them, click one to rename or remove it.'
              : viewOnly ? 'Click a spot to see what is stored there.' : 'Click a spot to open it, then pick a shelf or place. Taken places show who has them.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isManagerOrAdmin && !editLayout && layout && (layout.spots || []).length > 0 && (
            <button className="btn btn-sm" onClick={() => openSetup('')} style={{ fontSize: 13 }}>🛠 Set up shelves</button>
          )}
          {canEditLayout && (
            <button className="btn btn-sm" onClick={() => { setEditLayout(v => !v); setTool(null); setPlanMenu(null); setNewPlan(null) }}
              style={{ fontSize: 13, background: editLayout ? '#534AB7' : undefined, color: editLayout ? '#fff' : undefined, borderColor: editLayout ? '#534AB7' : undefined }}>
              {editLayout ? '✓ Done editing' : '✏️ Edit layout'}
            </button>
          )}
          {!inline && <button className="btn btn-sm" onClick={onClose}>✕ Close</button>}
        </div>
      </div>

      {/* Floor plans + edit tools */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => { setFacility(t.key); setTool(null); setPlanMenu(null) }} style={pillStyle(facility === t.key)}>{t.label}</button>
        ))}
        {editLayout && (newPlan === null
          ? <button type="button" onClick={() => setNewPlan('')} style={{ ...pillStyle(false), borderStyle: 'dashed' }}>+ New floor plan</button>
          : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input autoFocus value={newPlan} maxLength={40} placeholder="Floor plan name" onChange={e => setNewPlan(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createLayout(); if (e.key === 'Escape') setNewPlan(null) }} style={{ width: 180, padding: '6px 10px', fontSize: 13 }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={createLayout} disabled={!newPlan.trim()}>Add</button>
              <button type="button" className="btn btn-sm" onClick={() => setNewPlan(null)}>Cancel</button>
            </span>
          ))}
        <span style={{ flex: 1 }} />
        {editLayout && layout && (
          <>
            <button type="button" style={pillStyle(tool === 'room')} onClick={() => setTool(t => t === 'room' ? null : 'room')}>+ Add room</button>
            <button type="button" style={pillStyle(tool === 'spot')} disabled={!(layout.rooms || []).length} onClick={() => setTool(t => t === 'spot' ? null : 'spot')}>+ Place spot</button>
            <button type="button" style={pillStyle(!!planMenu)} onClick={() => setPlanMenu(m => m ? null : { name: layout.name, confirmDelete: false })}>Floor plan…</button>
          </>
        )}
      </div>
      {editLayout && tool && (
        <div style={{ padding: '8px 16px', background: '#EEEDFE', color: '#3730a3', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
          {tool === 'room' ? 'Drag on the map to draw the room.' : 'Click inside a room to place the spot.'}
          <button type="button" className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => setTool(null)}>Cancel</button>
        </div>
      )}
      {editLayout && planMenu && layout && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={planMenu.name} maxLength={40} onChange={e => setPlanMenu(m => ({ ...m, name: e.target.value }))} style={{ width: 200, padding: '6px 10px', fontSize: 13 }} aria-label="Floor plan name" />
          <button type="button" className="btn btn-sm btn-primary" disabled={!planMenu.name.trim() || planMenu.name.trim() === layout.name}
            onClick={async () => { if (await saveLayout(layout.id, { name: planMenu.name.trim() })) setPlanMenu(null) }}>Rename</button>
          <button type="button" className="btn btn-sm" onClick={() => photoInput.current?.click()}>{layout.image_url ? 'Replace background photo' : 'Add background photo'}</button>
          {layout.image_url && <button type="button" className="btn btn-sm" onClick={() => saveLayout(layout.id, { image_url: null, aspect: DEFAULT_ASPECT })}>Remove photo</button>}
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = '' }} />
          <span style={{ flex: 1 }} />
          {planMenu.confirmDelete
            ? <><span style={{ fontSize: 12, color: '#c84b2f' }}>Remove “{layout.name}” and everything drawn on it?</span>
                <button type="button" className="btn btn-sm" style={{ color: '#c84b2f', borderColor: '#e6a5a4' }} onClick={deleteLayout}>Remove</button>
                <button type="button" className="btn btn-sm" onClick={() => setPlanMenu(m => ({ ...m, confirmDelete: false }))}>Keep</button></>
            : <button type="button" className="btn btn-sm" style={{ color: '#c84b2f', borderColor: '#e6a5a4' }} onClick={() => setPlanMenu(m => ({ ...m, confirmDelete: true }))}>Remove floor plan</button>}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', fontSize: 11, color: 'var(--text2)' }}>
        {[['var(--surface)', 'var(--border)', 'Empty'], ['#E1F5EE', '#1D9E75', 'Has materials'], ['#EEEDFE', '#534AB7', 'Has yours']].map(([bg, bd, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, background: bg, border: `1px solid ${bd}` }} />{l}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: '#c84b2f' }} />Materials stored</span>
      </div>

      {/* Map */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : loadError ? (
          <div style={{ padding: 24, color: '#c84b2f', fontSize: 14 }}>{loadError}</div>
        ) : !facility ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 14 }}>
            {canEditLayout ? 'No floor plans yet. Press “✏️ Edit layout”, then “+ New floor plan”.' : 'No floor plans yet. Ask a lab manager or admin to draw one.'}
          </div>
        ) : layout ? (
          <LayoutMap layout={layout} aspect={aspectOf(layout)} spotState={spotState} editing={editLayout}
            tool={tool} onToolDone={() => setTool(null)} onChange={patch => saveLayout(layout.id, patch)}
            onSpotView={id => setViewSpotId(id)} onSetUp={id => openSetup(id)} spotHasItems={spotHasItems} />
        ) : facility === 'ICT' ? (
          <div style={{ padding: 16 }}><ICTMap occupancy={occupancy} selected={selected} onToggle={pickLocation} canEdit={!viewOnly && canEdit} /></div>
        ) : (
          <div style={{ padding: 16 }}><MPFMap occupancy={occupancy} selected={selected} onToggle={pickLocation} canEdit={!viewOnly && canEdit} /></div>
        )}
      </div>
    </div>
  )

  return (
    <>
    {inline ? panel : (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
        {panel}
      </div>
    )}

    {/* ── Set up shelves: shape the space; nothing is stored here ── */}
    {setupOpen && (() => {
      const spotsHere = allSpots.filter(s => !layout || s._layout === layout.id)
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>🛠 Set up shelves</div>
              <button className="btn btn-sm" onClick={() => setSetupOpen(false)}>✕ Close</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              Shape the space: racks, shelves and the places on each shelf. Materials are not stored here; people pick their place by opening the spot on the map.
            </div>
            {spotsHere.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>No spots on this floor plan yet. Add them with “✏️ Edit layout” → “+ Place spot”.</div>
            ) : (
              <>
                <div className="field">
                  <label>Spot</label>
                  <select value={setupSpotId} onChange={e => chooseSetupSpot(e.target.value)}>
                    <option value="">— Select a spot —</option>
                    {spotsHere.map(sp => {
                      const lay = layouts.find(l => l.id === sp._layout)
                      const room = (lay?.rooms || []).find(r => r.id === sp.room_id)
                      return <option key={sp.id} value={sp.id}>{room?.name || lay?.name} — {sp.name}</option>
                    })}
                  </select>
                </div>
                {setupDraft && (
                  <>
                    <div className="field">
                      <label>Type</label>
                      <select value={setupDraft.type} onChange={e => setSetupDraft(d => ({ ...d, type: e.target.value }))}>
                        <option value="pallet">Pallet (one place)</option>
                        <option value="floor">Floor (one place)</option>
                        <option value="racks">Racks with shelves</option>
                      </select>
                    </div>
                    {setupDraft.type === 'racks' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                          <div className="field"><label>Racks</label>
                            <input type="number" min={1} max={12} value={setupDraft.rackNames.length} onChange={e => setDraftRackCount(e.target.value)} />
                          </div>
                          <div className="field"><label>Shelves per rack</label>
                            <input type="number" min={1} max={26} value={setupDraft.shelvesPerRack} onChange={e => setSetupDraft(d => ({ ...d, shelvesPerRack: e.target.value }))} />
                          </div>
                          <div className="field"><label>Places per shelf</label>
                            <input type="number" min={1} max={12} value={setupDraft.placesPerShelf} onChange={e => setSetupDraft(d => ({ ...d, placesPerShelf: e.target.value }))} />
                          </div>
                        </div>
                        <div className="field">
                          <label>Rack names</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                            {setupDraft.rackNames.map((name, i) => (
                              <input key={i} value={name} placeholder={`Rack ${i + 1}`}
                                onChange={e => setSetupDraft(d => { const n = [...d.rackNames]; n[i] = e.target.value; return { ...d, rackNames: n } })} />
                            ))}
                          </div>
                        </div>
                        {(() => {
                          const sh = clamp(parseInt(setupDraft.shelvesPerRack) || 1, 1, 26)
                          const pl = clamp(parseInt(setupDraft.placesPerShelf) || 1, 1, 12)
                          return (
                            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, fontSize: 12, display: 'grid', gap: 4 }}>
                              <div style={{ color: 'var(--text3)', fontWeight: 600 }}>Each rack will read, top to bottom:</div>
                              {Array.from({ length: sh }, (_, i) => i + 1).map(n => (
                                <div key={n} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <b style={{ width: 18 }}>{shelfLetter(n)}</b>
                                  {pl > 1
                                    ? Array.from({ length: pl }, (_, k) => k + 1).map(p => <span key={p} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '1px 8px', background: 'var(--surface)' }}>{shelfLetter(n)}{p}</span>)
                                    : <span style={{ color: 'var(--text3)' }}>whole shelf</span>}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                      When places are added, anything already on a shelf moves to place 1; its owner can move it later. A place that still holds materials cannot be removed.
                    </div>
                  </>
                )}
                {setupError && <div style={{ fontSize: 13, color: '#c84b2f', background: '#fdecea', borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>{setupError}</div>}
              </>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSetup} disabled={!setupDraft || busy}>{busy ? 'Saving…' : 'Save layout'}</button>
            </div>
          </div>
        </div>
      )
    })()}

    {/* ── A spot's window: pick a place here ── */}
    {viewSpot && (() => {
      const isRacks = viewSpot.type === 'racks'
      const places = placeCount(viewSpot)
      const focus = isRacks ? focusId : viewSpot.id
      const focusOcc = focus ? occupancy[focus] : null
      const focusState = focus ? placeState(focus) : null
      const focusName = focus ? (isRacks ? getLocationDetail(focus).detail.replace(`${viewSpot.name} · `, '') : viewSpot.name) : ''
      const closeWindow = () => { setViewSpotId(''); setFocusId(''); setMoveItem(null); setOpenShelf('') }
      const lay = layouts.find(l => l.id === viewSpot._layout)
      const room = (lay?.rooms || []).find(r => r.id === viewSpot.room_id)

      const tileColours = st => st === 'here' ? { bg: '#E1F5EE', bd: '#1D9E75', fg: '#085041' }
        : st === 'mine' ? { bg: '#EEEDFE', bd: '#534AB7', fg: '#3730a3' }
        : st === 'taken' ? { bg: '#fdecea', bd: '#e6a5a4', fg: '#a32d2d' }
        : { bg: 'var(--surface)', bd: 'var(--border)', fg: 'var(--text2)' }
      const stateText = (st, occ) => st === 'here' ? 'This material' : st === 'mine' ? `Yours · ${occ.items.length}` : st === 'taken' ? `${occ.occupied_by || 'Taken'} · ${occ.items.length}` : 'Free'

      function tile(id, label) {
        const st = placeState(id)
        const c = tileColours(st)
        const on = focusId === id
        return (
          <button key={id} type="button" onClick={() => setFocusId(id)}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: c.bg, border: `1.5px solid ${on ? 'var(--accent)' : c.bd}`, borderRadius: 8, padding: '6px 8px',
              boxShadow: on ? '0 0 0 3px var(--accent-light)' : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
            <div style={{ fontSize: 11, color: c.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stateText(st, occupancy[id])}</div>
          </button>
        )
      }

      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 20, maxWidth: isRacks && places > 1 ? 560 : 440, width: '100%', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{viewSpot.name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isManagerOrAdmin && <button className="btn btn-sm" onClick={() => openSetup(viewSpot.id)}>🛠 Set up</button>}
                <button className="btn btn-sm" onClick={closeWindow}>✕ Close</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
              {[lay?.name, room?.name].filter(Boolean).join(' · ')}
              {isRacks && ' · shelves A (top) down'}{isRacks && places > 1 && ` · ${places} places per shelf`}
            </div>

            {moveItem && (
              <div style={{ background: '#EEEDFE', border: '1px solid #C5C2F5', color: '#3730a3', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>Moving <b>{moveItem.project_name || 'material'}</b> from {getLocationDetail(moveItem.from_id).detail.replace(`${viewSpot.name} · `, '')}. Pick its new place.</span>
                <button className="btn btn-sm" onClick={() => setMoveItem(null)}>Cancel</button>
              </div>
            )}

            {isRacks && (
              <div style={{ overflowY: 'auto', display: 'grid', gap: 10, paddingRight: 2 }}>
                {(viewSpot.rackNames || []).map((rackName, ri) => (
                  <div key={ri}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{rackName}</div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {Array.from({ length: viewSpot.shelvesPerRack || 1 }, (_, i) => i + 1).map(n => {
                        const base = `${viewSpot.id}-R${ri + 1}-S${n}`
                        const letter = shelfLetter(n)
                        if (places === 1) return (
                          <div key={n} style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                            <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{letter}</div>
                            {tile(base, `Shelf ${letter}`)}
                          </div>
                        )
                        // A divided shelf: one row with a summary; click to list A1, A2, A3
                        const ids = Array.from({ length: places }, (_, k) => `${base}-P${k + 1}`)
                        const states = ids.map(placeState)
                        const free = states.filter(x => x === 'free').length
                        const hereIdx = states.indexOf('here')
                        const shelfState = hereIdx >= 0 ? 'here' : states.includes('mine') ? 'mine' : free === 0 ? 'taken' : 'free'
                        const c = tileColours(shelfState)
                        const open = openShelf === base
                        const summary = hereIdx >= 0 ? `This material · ${letter}${hereIdx + 1}`
                          : free === places ? `${places} places free` : free === 0 ? 'Full' : `${free} of ${places} places free`
                        return (
                          <div key={n}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                              <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>{letter}</div>
                              <button type="button" onClick={() => setOpenShelf(open ? '' : base)}
                                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                                  background: c.bg, border: `1.5px solid ${open ? 'var(--accent)' : c.bd}`, borderRadius: 8, padding: '6px 8px' }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Shelf {letter}</span>
                                  <span style={{ display: 'block', fontSize: 11, color: c.fg }}>{summary}</span>
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{open ? '▴' : '▾'}</span>
                              </button>
                            </div>
                            {open && (
                              <div style={{ display: 'grid', gap: 4, margin: '4px 0 6px 28px', paddingLeft: 8, borderLeft: '2px solid var(--accent-light)' }}>
                                {ids.map((id, k) => <div key={id} style={{ display: 'flex' }}>{tile(id, `${letter}${k + 1}`)}</div>)}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* The chosen place: what is there, and what you can do */}
            {focus ? (
              <div style={{ marginTop: isRacks ? 10 : 0, padding: 12, border: '1.5px solid var(--accent)', background: 'var(--surface2)', borderRadius: 10, display: 'grid', gap: 8, flexShrink: 0 }}>
                <div style={{ fontSize: 13 }}>
                  <b>{focusName}</b>{' · '}
                  <span style={{ color: tileColours(focusState).fg }}>
                    {focusState === 'free' ? 'Available' : focusState === 'here' ? 'This material is stored here'
                      : focusState === 'mine' ? 'Your place — you can store more here' : `Taken by ${focusOcc?.occupied_by || 'someone else'}`}
                  </span>
                </div>
                {focusOcc?.occupied && (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {focusOcc.items.map((it, idx) => (
                      <div key={it.row_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, background: idx % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)', borderRadius: 6, padding: '6px 8px' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{it.project_name || 'Project'}</b>
                          {it.material_type && <span style={{ color: 'var(--text3)' }}> · {it.material_type}</span>}
                          <span style={{ display: 'block', color: 'var(--text3)' }}>Stored by {it.occupied_by || 'unknown'}</span>
                        </span>
                        {isManagerOrAdmin && it.material_id !== materialId && !moveItem && (
                          <button className="btn btn-sm" onClick={() => setMoveItem({ ...it, from_id: focus })}>Move</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {moveItem ? (
                  focus !== moveItem.from_id && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {focusState === 'taken' && <span style={{ fontSize: 12, color: '#a32d2d', flex: 1 }}>Someone else has this place — the material will share it.</span>}
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => moveMaterial(moveItem, focus)}>{busy ? 'Moving…' : `Move here (${focusName})`}</button>
                    </div>
                  )
                ) : picking && focusState === 'here' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>Remove it to free {focusName}, or pick another place to move it.</span>
                    <button className="btn btn-sm" onClick={() => isRacks ? setFocusId('') : closeWindow()}>Cancel</button>
                    <button className="btn btn-sm" style={{ color: '#c84b2f', borderColor: '#e6a5a4' }} disabled={saving} onClick={() => unstore(focus)}>{saving ? 'Saving…' : `Remove this material from ${focusName}`}</button>
                  </div>
                ) : picking && (
                  focusState === 'taken' && !isManagerOrAdmin ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Only the person who stores here first can add to this place. Pick a free place, or ask a lab manager.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {focusState === 'taken' && <span style={{ fontSize: 12, color: '#a32d2d', flex: 1 }}>This place belongs to {focusOcc?.occupied_by || 'someone else'}. As a lab manager you can still store here.</span>}
                      <button className="btn btn-sm" onClick={() => isRacks ? setFocusId('') : closeWindow()}>Cancel</button>
                      <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveLocations([focus])}>
                        {saving ? 'Saving…' : selected.length ? `Move this material to ${focusName}` : `Store this material in ${focusName}`}
                      </button>
                    </div>
                  )
                )}
              </div>
            ) : isRacks && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, flexShrink: 0 }}>
                {picking ? 'Click a shelf or place to choose it.' : 'Click a shelf or place to see what is stored there.'}
              </div>
            )}
          </div>
        </div>
      )
    })()}
    </>
  )
}
