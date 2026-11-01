import { useState } from 'react'
import { APP_VERSION, CHANGELOG } from '../lib/version.js'

// The app's modules, named as their dashboard icons. Each tile is a 3D tilt
// card: its own colour, a 3D object (public/tour/mod-<key>.png — Fluent Emoji,
// MIT, see SOURCES.txt) and a turn toward the mouse.
const FEATURES = [
  { key: 'supply',       label: 'Supply Inventory',        desc: 'Track supplies, run weekly inspections & export reports', grad: 'linear-gradient(140deg,#0f7a5a,#34d399)' },
  { key: 'equipment',    label: 'Equipment & Maintenance', desc: 'Manage and track all lab equipment inventory',           grad: 'linear-gradient(140deg,#7c2d12,#f59e0b)' },
  { key: 'equipmenthub', label: 'Equipment SOP',           desc: 'SOPs, training videos, standards & exams library',       grad: 'linear-gradient(140deg,#064e3b,#10b981)' },
  { key: 'booking',      label: 'Booking Equipment',       desc: 'Book equipment with a shared calendar & approvals',      grad: 'linear-gradient(140deg,#1e40af,#60a5fa)' },
  { key: 'training',     label: 'Training Records',        desc: 'Certificates, compliance tracking & exam history',       grad: 'linear-gradient(140deg,#075985,#38bdf8)' },
  { key: 'projects',     label: 'Project Workspace',       desc: 'Research projects, materials & test results',            grad: 'linear-gradient(140deg,#3f37a0,#8b85e6)' },
  { key: 'pm',           label: 'Task Board',              desc: 'Tasks, meetings, deadlines & team calendar',             grad: 'linear-gradient(140deg,#c2410c,#fdba74)' },
  { key: 'remessages',   label: 'Lab Messages',            desc: 'Team communication, notes & issue reports',              grad: 'linear-gradient(140deg,#155e75,#22d3ee)' },
]

// Turn the tile toward the mouse; a soft light follows the cursor
function tilt(e) {
  const el = e.currentTarget, r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
  el.style.transform = `rotateX(${((0.5 - y) * 14).toFixed(1)}deg) rotateY(${((x - 0.5) * 18).toFixed(1)}deg)`
  el.style.setProperty('--mx', `${(x * 100).toFixed(0)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(0)}%`)
}
const untilt = e => { e.currentTarget.style.transform = 'rotateX(0deg) rotateY(0deg)' }

const WHO = ['University research labs', 'Independent researchers', 'Lab managers & admins', 'Multi-user lab teams']

export default function AboutModal({ onClose, onContact }) {
  const [showChangelog, setShowChangelog] = useState(false)
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: 9999, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px 40px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 18, maxWidth: 560, width: '100%', boxShadow: '0 16px 56px rgba(0,0,0,0.22)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ background: '#0d47a1', padding: '32px 28px 24px', textAlign: 'center', position: 'relative' }}>
          {/* Top-right action buttons */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
            {onContact && (
              <button
                onClick={onContact}
                title="Contact Us"
                style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              >✉️</button>
            )}
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >×</button>
          </div>
          <img src={import.meta.env.BASE_URL + 'labhive_logo.svg'} width={264} height={264} alt="LabHive" style={{ display: 'block', margin: '-40px auto -89px', objectFit: 'contain' }} />
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px' }}>LabHive</div>
          <div style={{ color: '#ffb380', fontSize: 11, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 6 }}>The All-in-One Research Lab Platform</div>
          <div style={{ marginTop: 10 }}>
            <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 12px', letterSpacing: '0.04em' }}>v{APP_VERSION}</span>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '24px 24px 24px' }}>

          {/* Tagline */}
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.75, margin: '0 0 20px', textAlign: 'center' }}>
            Built by a lab researcher, for lab researchers. LabHive helps research teams manage equipment, track compliance, organize projects, and streamline day-to-day lab operations — all in one place.
          </p>

          {/* Features grid */}
          <style>{`
            .about-tile { position: relative; border-radius: 14px; padding: 30px 12px 12px; min-height: 108px; color: #fff;
              box-shadow: 0 10px 22px rgba(12,17,64,.16); transform-style: preserve-3d; transition: transform .15s ease-out, box-shadow .2s; }
            .about-tile::before { content: ''; position: absolute; inset: 0; border-radius: 14px; pointer-events: none;
              background: radial-gradient(circle at var(--mx, 50%) var(--my, 20%), rgba(255,255,255,.35), transparent 50%); }
            .about-tile::after { content: ''; position: absolute; inset: auto 0 0 0; height: 55%; border-radius: 0 0 14px 14px; pointer-events: none;
              background: linear-gradient(180deg, transparent, rgba(0,0,0,.16)); }
            .about-tile:hover { box-shadow: 0 16px 30px rgba(12,17,64,.24); }
            .about-tile img { position: absolute; right: 8px; top: -20px; width: 58px; height: 58px; transform: translateZ(50px);
              filter: drop-shadow(0 10px 10px rgba(0,0,0,.28)); pointer-events: none; }
            .about-tile .t { position: relative; z-index: 1; transform: translateZ(24px); }
            @media (prefers-reduced-motion: reduce) { .about-tile { transition: none; } }
          `}</style>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '26px 10px', marginBottom: 22, paddingTop: 14, perspective: 900 }}>
            {FEATURES.map(f => (
              <div key={f.key} className="about-tile" style={{ background: f.grad }} onMouseMove={tilt} onMouseLeave={untilt}>
                <img src={`${import.meta.env.BASE_URL}tour/mod-${f.key}.png`} alt="" />
                <div className="t">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, paddingRight: 44, textShadow: '0 1px 2px rgba(0,0,0,.25)' }}>{f.label}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,.9)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Who it's for */}
          <div style={{ background: '#e8f5f0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#085041', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Who uses LabHive?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WHO.map(t => (
                <span key={t} style={{ fontSize: 12, background: '#fff', border: '1px solid #9FE1CB', borderRadius: 20, padding: '4px 12px', color: '#085041' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Changelog */}
          <button
            onClick={() => setShowChangelog(s => !s)}
            style={{ width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, color: '#374151', fontSize: 13 }}
          >
            <span style={{ fontWeight: 600 }}>📋 What's new in each version</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{showChangelog ? '▲ hide' : '▼ show'}</span>
          </button>
          {showChangelog && (
            <div style={{ marginBottom: 16 }}>
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} style={{ marginBottom: i < CHANGELOG.length - 1 ? 14 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ background: i === 0 ? '#1D9E75' : '#6b7280', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px' }}>v{entry.version}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{entry.date}</span>
                    {i === 0 && <span style={{ fontSize: 10, background: '#E1F5EE', color: '#085041', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>Current</span>}
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'disc' }}>
                    {entry.highlights.map(h => (
                      <li key={h} style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.7 }}>{h}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Contact button */}
          {onContact && (
            <button
              onClick={onContact}
              style={{ width: '100%', padding: '12px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#178a65' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1D9E75' }}
            >
              ✉️ Contact Us
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
