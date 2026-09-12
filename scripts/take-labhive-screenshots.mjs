// Takes annotated screenshots of the labhive app for the Lab Manager Guide.
// Run:  node scripts/take-labhive-screenshots.mjs
// Then log in manually in the browser window that opens.
// Create the signal file when ready: touch /tmp/labhive-screenshots-ready
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT  = path.join(__dirname, '../guide-screenshots')
const BASE = 'http://localhost:5174'
const READY_FLAG = '/tmp/labhive-screenshots-ready'

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function highlight(page, findText) {
  await page.evaluate((text) => {
    document.getElementById('ss-ann')?.remove()
    const all = [...document.querySelectorAll('button, a, li, div, span, input, label')]
    const el = all.find(e => {
      const t = e.textContent.trim()
      return (t === text || t.startsWith(text + ' ') || t.endsWith(' ' + text)) &&
             e.offsetWidth > 0 && e.offsetHeight > 4 && e.offsetWidth < 600
    })
    if (!el) { console.warn('[ann] not found:', text); return }
    const r = el.getBoundingClientRect()
    const p = 6
    const d = document.createElement('div')
    d.id = 'ss-ann'
    d.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'pointer-events:none',
      `left:${r.left - p}px`, `top:${r.top - p}px`,
      `width:${r.width + p * 2}px`, `height:${r.height + p * 2}px`,
      'border:3px solid #e53935', 'border-radius:8px',
      'background:rgba(229,57,53,0.08)',
      'box-shadow:0 0 0 2px rgba(229,57,53,0.25)',
    ].join(';')
    document.body.appendChild(d)
  }, findText)
  await sleep(200)
}

async function clearHighlight(page) {
  await page.evaluate(() => document.getElementById('ss-ann')?.remove())
}

async function snap(page, filename) {
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false })
  await clearHighlight(page)
  console.log('✓', filename)
}

async function clickSidebarModule(page, labelFragment) {
  await page.evaluate((frag) => {
    const all = [...document.querySelectorAll('button, a, div, li, span')]
    const el  = all.find(e => {
      const txt = e.textContent.trim()
      return txt.includes(frag) && txt.length < 80 &&
             getComputedStyle(e).cursor === 'pointer'
    })
    if (el) el.click()
    else console.warn('[nav] not found:', frag)
  }, labelFragment)
  await sleep(2000)
}

async function clickTab(page, label) {
  await page.evaluate((lbl) => {
    const btns = [...document.querySelectorAll('button, div, li')]
    const el   = btns.find(b => {
      const txt = b.textContent.trim()
      return txt === lbl || txt.startsWith(lbl)
    })
    if (el) el.click()
    else console.warn('[tab] not found:', lbl)
  }, label)
  await sleep(1500)
}

const goHome = async (page) => {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, div')]
    const home = btns.find(b => b.textContent.trim() === 'Home' || b.title === 'Home')
    if (home) home.click()
  })
  await sleep(1800)
}

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  if (fs.existsSync(READY_FLAG)) fs.unlinkSync(READY_FLAG)

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1300,820', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  // ── 1. Login page ──────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(2500)
  await highlight(page, 'Sign in')
  await snap(page, '01-login.png')

  // ── Wait for manual login ──────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('👉  Log in to labhive in the browser window.')
  console.log('    Then run:  touch ' + READY_FLAG)
  console.log('='.repeat(60) + '\n')
  while (!fs.existsSync(READY_FLAG)) { await sleep(1000) }
  fs.unlinkSync(READY_FLAG)
  console.log('✓ Signal received — taking screenshots\n')
  await sleep(2500)

  // ── 2. Dashboard ───────────────────────────────────────────────
  console.log('=== Dashboard ===')
  await highlight(page, 'Lab Management')
  await snap(page, '02-dashboard.png')

  // ── 3. Lab Management — Users ──────────────────────────────────
  console.log('\n=== Lab Management ===')
  await clickSidebarModule(page, 'Lab Management')
  await sleep(800)
  await highlight(page, 'Lab Users')
  await snap(page, '03-labmanagement-users.png')

  await clickTab(page, 'Approval')
  await sleep(500)
  await highlight(page, 'Approval')
  await snap(page, '04-labmanagement-approvals.png')

  // ── 4. Training Records ────────────────────────────────────────
  console.log('\n=== Training Records ===')
  await goHome(page)
  await clickSidebarModule(page, 'Training')
  await sleep(1500)
  await highlight(page, 'Training Records')
  await snap(page, '05-training-cards.png')

  // Click first user card
  await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')]
    const card = divs.find(d => getComputedStyle(d).cursor === 'pointer' && d.offsetHeight > 60 && d.offsetHeight < 200)
    if (card) card.click()
  })
  await sleep(1500)

  await clickTab(page, 'Safety')
  await sleep(500)
  await highlight(page, 'Safety')
  await snap(page, '08-training-safety.png')

  await clickTab(page, 'Documents')
  await sleep(500)
  await highlight(page, 'Documents')
  await snap(page, '06-training-user-open.png')
  await snap(page, '07-training-documents.png')

  // ── 5. Equipment & Maintenance ─────────────────────────────────
  console.log('\n=== Equipment ===')
  await goHome(page)
  await clickSidebarModule(page, 'Equipment & Maintenance')
  await sleep(1000)
  await highlight(page, 'List of Equipment')
  await snap(page, '09-equipment-list.png')

  await clickTab(page, 'Maintenance')
  await sleep(500)
  await highlight(page, 'Maintenance')
  await snap(page, '10-equipment-maintenance.png')

  // ── 6. Equipment SOP Hub ───────────────────────────────────────
  console.log('\n=== Equipment SOP ===')
  await goHome(page)
  await clickSidebarModule(page, 'Equipment SOP')
  await sleep(1200)
  await highlight(page, 'Equipment SOP')
  await snap(page, '11-sop-hub.png')

  // ── 7. Booking ─────────────────────────────────────────────────
  console.log('\n=== Booking ===')
  await goHome(page)
  await clickSidebarModule(page, 'Reserve Equipment')
  await sleep(2200)
  await highlight(page, 'Reserve Equipment')
  await snap(page, '13-booking-calendar.png')

  await clickTab(page, 'Special')
  await sleep(500)
  await highlight(page, 'Special')
  await snap(page, '14-booking-special.png')

  // ── 8. Task Board ──────────────────────────────────────────────
  console.log('\n=== Task Board ===')
  await goHome(page)
  await clickSidebarModule(page, 'Task Board')
  await sleep(1000)
  await clickTab(page, 'My Tasks')
  await sleep(500)
  await highlight(page, 'My Tasks')
  await snap(page, '15-tasks-mytasks.png')

  await clickTab(page, 'Calendar')
  await sleep(1000)
  await highlight(page, 'Calendar')
  await snap(page, '16-tasks-calendar.png')

  await clickTab(page, 'Meetings')
  await sleep(500)
  await highlight(page, 'Meetings')
  await snap(page, '17-tasks-meetings.png')

  // ── 9. Supply Inventory ────────────────────────────────────────
  console.log('\n=== Supply Inventory ===')
  await goHome(page)
  await clickSidebarModule(page, 'Supply')
  await sleep(1000)
  await highlight(page, 'Inspection')
  await snap(page, '18-supply-inspection.png')

  await clickTab(page, 'Rooms')
  await sleep(500)
  await highlight(page, 'Rooms')
  await snap(page, '20-supply-rooms.png')

  await clickTab(page, 'Supplies')
  await sleep(500)
  await highlight(page, 'Supplies')
  await snap(page, '19-supply-supplies.png')

  // ── 10. Lab Messages ───────────────────────────────────────────
  console.log('\n=== Lab Messages ===')
  await goHome(page)
  await clickSidebarModule(page, 'Lab Messages')
  await sleep(1200)
  await highlight(page, 'Lab Messages')
  await snap(page, '21-messages.png')

  // ── 11. Project Workspace ──────────────────────────────────────
  console.log('\n=== Projects ===')
  await goHome(page)
  await clickSidebarModule(page, 'Project Workspace')
  await sleep(1500)
  await highlight(page, 'Project Workspace')
  await snap(page, '22-projects.png')

  // ── 12. QR Labels ──────────────────────────────────────────────
  console.log('\n=== QR Labels ===')
  await goHome(page)
  await clickSidebarModule(page, 'QR Labels')
  await sleep(1200)
  await highlight(page, 'QR Labels')
  await snap(page, '24-qr-labels.png')

  // ── 13. Profile ────────────────────────────────────────────────
  console.log('\n=== Profile ===')
  await goHome(page)
  await clickSidebarModule(page, 'Profile')
  await sleep(1500)
  await highlight(page, 'My Profile')
  await snap(page, '25-profile.png')

  await clickTab(page, 'Dashboard Icons')
  await sleep(500)
  await highlight(page, 'Dashboard Icons')
  await snap(page, '27-profile-icons.png')

  await clickTab(page, 'Notifications')
  await sleep(500)
  await highlight(page, 'Notifications')
  await snap(page, '26-profile-notifications.png')

  console.log('\n✅ All screenshots saved to:', OUT)
  await browser.close()
})()
