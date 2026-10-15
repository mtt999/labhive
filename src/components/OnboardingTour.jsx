import { useState, useRef, useEffect } from 'react'
import { TOURS, startTour } from '../lib/tours'

// ── Tour card definitions ──────────────────────────────────────────────────

function getTourCards(session) {
  const name = session?.username || 'there'
  const isSolo = session?.loginMode === 'solo'
  const isManager = session?.role === 'user' || session?.role === 'admin'
  const isSuperAdmin = session?.role === 'admin' && !session?.userId

  if (isSuperAdmin) return []

  const accent = isSolo ? '#534AB7' : '#1D9E75'

  const cards = [
    {
      emoji: '🐝',
      title: `Welcome, ${name}!`,
      body: "You're now in LabHive — the all-in-one research lab management platform. Let's take a quick tour to help you get started.",
      accent,
    },
    {
      emoji: '🗂️',
      title: 'Your Dashboard',
      body: 'These cards are your modules. Click any card to open it.\n\nCustomize which modules appear here by going to Profile → Dashboard Icons.',
      accent,
    },
    {
      emoji: '👤',
      title: 'Your Profile',
      body: 'Click your profile icon (top-right corner) to:\n• Add or change your profile photo\n• Update your name and personal info\n• Change your password\n• Customize your dashboard icons\n• Sign out',
      accent,
    },
    isSolo
      ? {
          emoji: '🔬',
          title: 'Your Solo Workspace',
          body: "This is your personal research workspace — everything here belongs to you.\n\nYou can invite collaborators to share your workspace from Profile → Teammates.",
          accent,
        }
      : {
          emoji: '🏢',
          title: 'Your Team Workspace',
          body: "You're working in a shared team space. Your projects, training records, and bookings are shared with your lab managers.\n\nEveryone collaborates toward the same research goals.",
          accent,
        },
    {
      emoji: '💬',
      title: 'Get Help Anytime',
      body: 'Chat with Sara — the button at the bottom-right — for instant answers about LabHive.\n\nTap the ? button in the header anytime to replay this tour.',
      accent,
    },
  ]

  if (isManager && !isSolo) {
    cards.push({
      emoji: '⚙️',
      title: 'Managing Your Team',
      body: 'As a lab manager, you can:\n• Lab Management → add users & set their module access\n• Training Records → review and approve submissions\n• Equipment Booking → approve booking requests\n• Admin Panel → customize org settings and module icons',
      accent,
    })
  }

  return cards
}

// ── Module tip content ─────────────────────────────────────────────────────

const SCREEN_TIPS = {
  booking: {
    title: 'Equipment Booking',
    body: 'Pick equipment, choose a date and time, then submit your request. A lab manager approves it and you\'ll get a notification when it\'s confirmed.\n\nTip: scan an equipment QR code to jump straight to its booking page.',
  },
  training: {
    title: 'Training Records',
    body: 'Upload your training certificates here — each one is reviewed and approved by a lab manager. Track vehicle logs, equipment training, alarm training, and more.',
  },
  projects: {
    title: 'Project Workspace',
    body: 'Create and manage your research projects. Track material inventory with barcode scanning, record test results, and store project files and links.\n\nSolo users can share their workspace with collaborators from Profile → Teammates.',
  },
  home: {
    title: 'Supply Inventory',
    body: 'Run room-by-room supply inspections. Count items, flag low stock, and add notes. All results are timestamped and can be exported to Excel.',
  },
  equipmenthub: {
    title: 'Equipment SOP',
    body: 'Browse standard operating procedures, watch training videos, and take knowledge-check exams. Complete your training here before booking equipment for the first time.',
  },
  barcode: {
    title: 'QR Scanner',
    body: 'Scan any project material barcode to look up its details instantly. Use this to quickly identify materials in your research projects.',
  },
  barcodeqr: {
    title: 'QR Labels',
    body: 'Generate and print QR code labels for lab equipment. When someone scans a label it opens that equipment\'s SOP, booking calendar, and contact info.',
  },
  pm: {
    title: 'Preventive Maintenance',
    body: 'Track maintenance tasks for lab equipment. Set deadlines, assign responsibilities, and monitor completion to keep your equipment running reliably.',
  },
  labmanagement: {
    title: 'Lab Management',
    body: 'Add and manage lab users here. Set which modules each person can access, activate or deactivate accounts, and view your whole team at a glance.',
  },
  equipment: {
    title: 'Equipment Inventory',
    body: 'Track and manage all lab equipment here. Add items, record calibration dates, assign locations, and attach photos or documents to each piece of equipment.',
  },
  equipmentscan: {
    title: 'Equipment QR Page',
    body: "You've arrived via a QR code scan. From here you can view the SOP, book the equipment, send a message to the lab, or check calibration records.",
  },
  history: {
    title: 'Inspection History',
    body: 'Browse all past supply inspection records here. Filter by room or date, view item-level results, and export reports to Excel.',
  },
  remessages: {
    title: 'Lab Messages',
    body: 'Send and receive messages between lab members and managers here. You can message individuals or broadcast to the whole team.',
  },
}

// ── ModuleTip banner ───────────────────────────────────────────────────────

export function ModuleTip({ screen, userId, accentColor }) {
  const tip = SCREEN_TIPS[screen]
  const key = `ilab_tip_${userId}_${screen}`
  const [visible, setVisible] = useState(() => !!tip && localStorage.getItem(key) !== 'seen')
  const A = accentColor || '#1D9E75'
  const isGreen = A === '#1D9E75'

  if (!visible || !tip) return null

  function dismiss() {
    localStorage.setItem(key, 'seen')
    setVisible(false)
  }

  const bgColor    = isGreen ? '#eaf7f2' : '#eeedfe'
  const borderCol  = isGreen ? '#6ee7c3' : '#c4bffa'
  const accentBdr  = A
  const titleColor = isGreen ? '#064e35' : '#2d2470'
  const bodyColor  = isGreen ? '#065f46' : '#3d34a0'
  const btnBg      = isGreen ? '#bbf7d0' : '#ddd6fe'
  const btnColor   = isGreen ? '#14532d' : '#2d2470'

  return (
    <div style={{
      marginBottom: 16,
      background: `linear-gradient(135deg, ${bgColor} 0%, #f8fafc 100%)`,
      border: `1px solid ${borderCol}`,
      borderLeft: `4px solid ${accentBdr}`,
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      animation: 'tip-in 0.35s cubic-bezier(0.34,1.2,0.64,1)',
    }}>
      <style>{`@keyframes tip-in { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>💡</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: titleColor, marginBottom: 3 }}>{tip.title}</div>
        <div style={{ fontSize: 12.5, color: bodyColor, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{tip.body}</div>
      </div>
      <button
        onClick={dismiss}
        style={{ flexShrink: 0, background: btnBg, border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: btnColor, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', marginTop: 1 }}
      >Got it ✓</button>
    </div>
  )
}

// ── Help button with callout bubble ───────────────────────────────────────

export function HelpTourButton({ loginCount, tourDone = false, onOpen, accentColor = '#1D9E75' }) {
  const showCallout = !tourDone && loginCount > 0 && loginCount <= 3
  const showRings   = !tourDone && loginCount > 0 && loginCount <= 5
  const [calloutVisible, setCalloutVisible] = useState(false)
  const isSolo = accentColor === '#534AB7'
  const rgb = isSolo ? '83,74,183' : '29,158,117'

  useEffect(() => {
    if (!showCallout) { setCalloutVisible(false); return }
    const show = setTimeout(() => setCalloutVisible(true), 1400)
    const hide = setTimeout(() => setCalloutVisible(false), 8000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [showCallout])

  // The "?" opens a list of every guided tour (lib/tours.js), so each one
  // can be taken again whenever someone wants it.
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    const away = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setMenuOpen(false) }
    const esc = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [menuOpen])

  function handleClick() {
    setCalloutVisible(false)
    setMenuOpen(o => !o)
  }

  function pick(t) {
    setMenuOpen(false)
    if (t.key === 'website') onOpen()
    else startTour(t)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <style>{`
        @keyframes help-ring  { 0%{transform:scale(1);opacity:0.7} 70%{transform:scale(2.1);opacity:0} 100%{transform:scale(2.1);opacity:0} }
        @keyframes callout-in { from{opacity:0;transform:translateY(-6px) scale(0.92)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      <button
        onClick={handleClick}
        title="Guided tours" aria-haspopup="menu" aria-expanded={menuOpen}
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s ease', fontWeight: 800, fontSize: 15, fontFamily: 'inherit' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px) scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
      >
        {showRings && (
          <>
            <span style={{ position: 'absolute', inset: -3, borderRadius: 13, border: `2px solid rgba(${rgb},0.75)`, animation: 'help-ring 2.2s ease-out infinite', pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', inset: -3, borderRadius: 13, border: `2px solid rgba(${rgb},0.45)`, animation: 'help-ring 2.2s ease-out 0.9s infinite', pointerEvents: 'none' }} />
          </>
        )}
        ?
      </button>

      {menuOpen && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 300, maxWidth: 'calc(100vw - 24px)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)', padding: 8, zIndex: 600 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px 8px' }}>Guided tours</div>
          {TOURS.map(t => (
            <button key={t.key} role="menuitem" onClick={() => pick(t)}
              style={{ display: 'grid', gap: 2, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0d1b35' }}>▶ {t.title}</span>
              <span style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.45 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Speech-bubble callout */}
      {calloutVisible && (
        <div
          onClick={handleClick}
          style={{
            position: 'absolute', top: 'calc(100% + 12px)', right: 0,
            background: '#fff', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
            padding: '10px 14px', minWidth: 186, cursor: 'pointer', zIndex: 500,
            animation: 'callout-in 0.28s cubic-bezier(0.34,1.3,0.64,1)',
          }}
        >
          <div style={{ position: 'absolute', top: -7, right: 12, width: 14, height: 14, background: '#fff', transform: 'rotate(45deg)', borderTop: '1px solid rgba(0,0,0,0.06)', borderLeft: '1px solid rgba(0,0,0,0.06)' }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1b35', marginBottom: 3 }}>👋 New here?</div>
          <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>Click to start the guided tour and learn how to use LabHive.</div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: accentColor }}>Start tour →</div>
        </div>
      )}
    </div>
  )
}

// ── OnboardingTour modal ───────────────────────────────────────────────────

export default function OnboardingTour({ session, onDone }) {
  const [step, setStep] = useState(0)
  const prevStep = useRef(0)
  const cards = getTourCards(session)

  if (!cards.length) { onDone?.(); return null }

  const card = cards[step]
  const isLast = step === cards.length - 1
  const A = card.accent || '#1D9E75'

  function finish() {
    const uid = session?.userId || session?.soloId || 'noid'
    localStorage.setItem(`ilab_tour_done_${uid}`, 'true')
    onDone?.()
  }

  function goNext() { prevStep.current = step; setStep(s => s + 1) }
  function goBack() { prevStep.current = step; setStep(s => s - 1) }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,40,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) finish() }}
    >
      <style>{`
        @keyframes tour-pop  { from { opacity:0; transform:scale(0.94) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes tour-card { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
      `}</style>

      <div style={{
        position: 'relative',
        background: '#fff',
        borderRadius: 24,
        width: '100%',
        maxWidth: 430,
        overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
        animation: 'tour-pop 0.32s cubic-bezier(0.34,1.3,0.64,1)',
      }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: '#f1f5f9' }}>
          <div style={{ height: '100%', background: A, width: `${((step + 1) / cards.length) * 100}%`, transition: 'width 0.35s ease', borderRadius: 2 }} />
        </div>

        {/* Step label + skip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Step {step + 1} of {cards.length}
          </span>
          <button
            onClick={finish}
            style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}
          >Skip tour</button>
        </div>

        {/* Card content */}
        <div key={step} style={{ padding: '20px 28px 24px', textAlign: 'center', animation: 'tour-card 0.22s ease' }}>
          <div style={{ fontSize: 60, lineHeight: 1, marginBottom: 16 }}>{card.emoji}</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#0d1b35', marginBottom: 14, letterSpacing: '-0.4px', lineHeight: 1.2 }}>{card.title}</div>
          <div style={{
            fontSize: 14, color: '#374151', lineHeight: 1.75, whiteSpace: 'pre-line',
            textAlign: 'left', background: '#f8fafc', borderRadius: 12,
            padding: '14px 16px', border: '1px solid #f1f5f9',
          }}>{card.body}</div>
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 22 : 7,
                height: 7,
                borderRadius: 4,
                background: i === step ? A : '#d1d5db',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button
              onClick={goBack}
              style={{ flex: 1, padding: '12px 0', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', color: '#4b5563', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb' }}
            >← Back</button>
          )}
          <button
            onClick={isLast ? finish : goNext}
            style={{ flex: 3, padding: '12px 0', border: 'none', borderRadius: 12, background: A, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: `0 4px 14px ${A}55` }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = `0 6px 20px ${A}77` }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = `0 4px 14px ${A}55` }}
          >{isLast ? 'Get started! 🚀' : 'Next →'}</button>
        </div>

        {/* Don't show again checkbox */}
        <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: '#9ca3af' }}>
            <input
              type="checkbox"
              onChange={e => { if (e.target.checked) finish() }}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#1D9E75', flexShrink: 0 }}
            />
            Don't show this again
          </label>
        </div>
      </div>
    </div>
  )
}
