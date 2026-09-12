// Converts the ICT-Lab HTML guide into a LabHive-branded version.
// Run: node scripts/make-labhive-guide.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const SRC  = path.join(__dirname, '../../ictlab/ictlab-lab-manager-guide.html')
const DEST = path.join(ROOT, 'labhive-lab-manager-guide.html')
const LOGO = path.join(ROOT, 'public/labhive_logo.svg')

let html = fs.readFileSync(SRC, 'utf8')

// ── 1. Embed LabHive SVG logo as base64 in place of the ICT logo img ─────
const svgRaw  = fs.readFileSync(LOGO, 'utf8')
const svgB64  = Buffer.from(svgRaw).toString('base64')
// filter:none overrides the .cover img { filter: brightness(0) invert(1) } CSS
// so the LabHive logo renders with its natural colors instead of as white silhouette
const logoTag = `<img src="data:image/svg+xml;base64,${svgB64}" alt="LabHive" style="width:160px;height:auto;filter:none;">`

// Replace ALL ICT logo <img ...> tags (cover + footer)
html = html.replace(/<img src="public\/ict-logo\.png"[^>]*>/g, logoTag)

// ── 2. Text replacements — most specific first ────────────────────────────
const replacements = [
  // title & headings
  ['ICT-Lab — Lab Manager Guide',           'LabHive — Lab Manager Guide'],
  ['ICT-Lab Platform<br>User Guide',         'LabHive Platform<br>User Guide'],
  ['ICT-Lab Platform — Lab Manager User Guide v2.0', 'LabHive Platform — Lab Manager User Guide v2.0'],
  ['ICT-Lab Platform</strong> — Lab Manager User Guide v2.0', 'LabHive Platform</strong> — Lab Manager User Guide v2.0'],

  // Cover institution line — remove UIUC/ICT affiliation
  [
    'Illinois Consolidated Technologies Lab<br>\n    University of Illinois Urbana-Champaign',
    'Lab Management Platform'
  ],
  [
    'Illinois Consolidated Technologies Lab<br>    University of Illinois Urbana-Champaign',
    'Lab Management Platform'
  ],
  [
    'Illinois Consolidated Technologies Lab<br>\r\n    University of Illinois Urbana-Champaign',
    'Lab Management Platform'
  ],

  // Descriptions & body text
  ['How to access ICT-Lab and navigate the platform', 'How to access LabHive and navigate the platform'],
  ['Accessing ICT-Lab',                     'Accessing LabHive'],
  ['ICT-Lab is a web-based platform',       'LabHive is a web-based platform'],
  ['ICT-Lab and navigate',                  'LabHive and navigate'],

  // URLs
  ['https://ictlab.app/?support=1',         'https://labhive.app/?support=1'],
  ['https://ictlab.app',                    'https://labhive.app'],
  ['noreply@ictlab.app',                    'noreply@labhive.app'],

  // Screenshot caption tag
  ['Screenshot: ictlab.app login screen',   'Screenshot: labhive.app login screen'],

  // Footer institution line
  [
    'University of Illinois Urbana-Champaign &nbsp;·&nbsp; Illinois Consolidated Technologies Lab<br>',
    'Lab Management Platform<br>'
  ],

  // Any remaining ICT-Lab compound names
  ['ICT-Lab Platform',                      'LabHive Platform'],
  ['ICT-Lab',                               'LabHive'],

  // "ICT" as standalone word (in footer strong tag etc)
  [/<strong[^>]*>ICT<\/strong>/g,           '<strong>LabHive</strong>'],
]

for (const [from, to] of replacements) {
  if (from instanceof RegExp) {
    html = html.replace(from, to)
  } else {
    // Replace all occurrences (split+join avoids needing regex escaping)
    html = html.split(from).join(to)
  }
}

// ── 3. Clickable TOC — section headings + sub-chapter links ───────────────

// IDs for the 12 sections + the Quick Reference card (13th sec-head)
const secIds = [
  'sec-1','sec-2','sec-3','sec-4','sec-5','sec-6',
  'sec-7','sec-8','sec-9','sec-10','sec-11','sec-12','sec-ref',
]

// Add id="sec-N" to each <div class="sec-head"...> in document order
let sIdx = 0
html = html.replace(/<div class="sec-head"([^>]*)>/g, (_, rest) => {
  const id = secIds[sIdx++] ?? `sec-${sIdx}`
  return `<div class="sec-head" id="${id}"${rest}>`
})

// Replace each <div class="toc-item">...</div> with <a href="#sec-N" ...>...</a>
let tIdx = 0
html = html.replace(/<div class="toc-item">([\s\S]*?)<\/div>/g, (_, inner) => {
  const id = secIds[tIdx++] ?? 'sec-ref'
  return `<a href="#${id}" class="toc-item">${inner}</a>`
})

// ── 4. Sub-chapter links ──────────────────────────────────────────────────

// Add id="sub-N" to every <h3> tag in document order (46 total)
let h3Idx = 0
html = html.replace(/<h3>/g, () => `<h3 id="sub-${++h3Idx}">`)

// Map each toc-subs section (in TOC order) to the sub-IDs of its <li> items.
// h3 IDs were assigned by document order — see grep results for the numbering.
const subLinks = [
  // Sec 1 — Getting Started: login, dashboard, sidebar+notifs
  ['sub-1', 'sub-2', 'sub-3'],
  // Sec 2 — Lab Management: lab users, managers, approvals
  ['sub-5', 'sub-6', 'sub-7'],
  // Sec 3 — Training: safety, documents, vehicle, equipment, alarm, locker
  ['sub-8', 'sub-9', 'sub-10', 'sub-11', 'sub-12', 'sub-13'],
  // Sec 4 — Equipment: inventory, maintenance, settings
  ['sub-15', 'sub-16', 'sub-17'],
  // Sec 5 — SOP Hub: SOPs/videos, online exams, QR scan
  ['sub-18', 'sub-19', 'sub-20'],
  // Sec 6 — Booking: calendar, approving/denying, drag-reschedule, special, settings
  ['sub-21', 'sub-22', 'sub-21', 'sub-23', 'sub-24'],
  // Sec 7 — Task Board: my tasks, team, meetings/calendar, reminders
  ['sub-26', 'sub-27', 'sub-29', 'sub-30'],
  // Sec 8 — Supply Inventory: inspection, export, rooms & supplies
  ['sub-31', 'sub-32', 'sub-33'],
]

let subSecIdx = 0
html = html.replace(/<ul class="toc-subs">([\s\S]*?)<\/ul>/g, (_, content) => {
  const links = subLinks[subSecIdx++] || []
  let liIdx = 0
  const newContent = content.replace(/<li>([\s\S]*?)<\/li>/g, (_, text) => {
    const id = links[liIdx++]
    if (id) return `<li><a href="#${id}" class="toc-sub-link">${text}</a></li>`
    return `<li>${text}</li>`
  })
  return `<ul class="toc-subs">${newContent}</ul>`
})

// CSS for both link types
html = html.replace('</style>',
  `a.toc-item { color: inherit; text-decoration: none; cursor: pointer; }
a.toc-item:hover .toc-fill { text-decoration: underline; }
a.toc-sub-link { color: #4a5578; text-decoration: none; }
a.toc-sub-link:hover { text-decoration: underline; color: #1a3a6e; }
</style>`)

fs.writeFileSync(DEST, html, 'utf8')
console.log('✅ LabHive guide written to:')
console.log('  ', DEST)
console.log('   Size:', (fs.statSync(DEST).size / 1024 / 1024).toFixed(1) + ' MB')
