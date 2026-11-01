import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { DEMO_LAB_SLUG, DEMO_DAYS, DEMO_REPLY_TO, demoPassword, demoWelcomeEmail, demoDeclineEmail } from '../lib/demoAccess'

// Super admin → Demo Requests (Nov 2026). Requests come from "Request a demo"
// on labhive.app (landing/index.html) into demo_requests. Send demo access
// makes a Demo Lab login (create-lab-users "demo" action) and emails it
// (design A). The 15 days are shown HERE only — visitors are never told.
// See demo_requests_setup.sql.

async function callFn(body) {
  const { data, error } = await sb.functions.invoke('create-lab-users', { body })
  if (error) {
    let msg = error.message
    try { const extra = await error.context?.json(); if (extra?.error) msg = extra.error } catch { /* not JSON */ }
    return { error: msg }
  }
  return { data }
}
const kickSender = () => sb.functions.invoke('send-emails', { body: {} }).catch(() => {})

const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
const fmtWhen = ts => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const daysLeft = ts => Math.max(0, Math.ceil((new Date(ts) - Date.now()) / 86400000))

const chip = (bg, fg) => ({ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '2px 9px', background: bg, color: fg, whiteSpace: 'nowrap' })
const TABS = [
  { key: 'new', label: 'Waiting' },
  { key: 'sent', label: 'Active' },
  { key: 'done', label: 'Ended & declined' },
]

export default function DemoRequests({ onClose, onChanged }) {
  const { toast } = useAppStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState('new')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('demo_requests').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) { setMissing(/demo_requests|does not exist|schema cache/i.test(error.message)); setRows([]) }
    else { setMissing(false); setRows(data || []) }
    setLoading(false)
  }

  async function queueEmail(to, { subject, text, html }, type) {
    // Reply-To support@ — the welcome email says "Reply to this email" to book a
    // meeting, and noreply@ is not read. Cloudflare forwards support@ to Gmail.
    const { error } = await sb.from('email_notifications_queue').insert({ to_email: to, subject, body: text, html_body: html, type, reply_to: DEMO_REPLY_TO })
    if (error) throw new Error('The email could not be queued: ' + error.message)
    kickSender()
  }

  async function sendAccess(r) {
    setBusyId(r.id)
    try {
      const { data: org, error: oErr } = await sb.from('organizations').select('id').eq('slug', DEMO_LAB_SLUG).maybeSingle()
      if (oErr || !org) throw new Error(`The Demo Lab organization (slug "${DEMO_LAB_SLUG}") was not found`)
      const password = demoPassword()
      const { data, error } = await callFn({ action: 'demo', orgId: org.id, requestId: r.id, password })
      if (error) throw new Error(error)
      await queueEmail(r.email, demoWelcomeEmail({ firstName: r.first_name, email: data.email || r.email, password, wantsMeeting: r.wants_meeting }), 'demo_welcome')
      toast(`Demo access sent to ${r.email}${data.reused ? ' (their earlier demo account was reopened)' : ''} ✓`)
      await load(); onChanged?.()
    } catch (e) { toast('Could not send demo access: ' + (e.message || e)) }
    setBusyId(null)
  }

  async function decline(r) {
    setBusyId(r.id)
    try {
      const { data, error } = await sb.from('demo_requests').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', r.id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('nothing was changed')
      await queueEmail(r.email, demoDeclineEmail({ firstName: r.first_name }), 'demo_declined')
      toast('Declined — a short note was emailed ✓')
      await load(); onChanged?.()
    } catch (e) { toast('Could not decline: ' + (e.message || e)) }
    setBusyId(null)
  }

  // +7 days. An ended demo comes back to life (the account is switched on).
  async function extend(r) {
    setBusyId(r.id)
    try {
      const base = r.expires_at && new Date(r.expires_at) > new Date() ? new Date(r.expires_at) : new Date()
      const patch = { extended_days: (r.extended_days || 0) + 7 }
      if (r.first_login_at) patch.expires_at = new Date(base.getTime() + 7 * 86400000).toISOString()
      if (r.status === 'ended') { patch.status = 'sent'; patch.ended_at = null }
      const { data, error } = await sb.from('demo_requests').update(patch).eq('id', r.id).select('id')
      if (error || !data?.length) throw new Error(error?.message || 'nothing was changed')
      if (r.user_id) await sb.from('users').update({ is_active: true }).eq('id', r.user_id)
      toast('Extended by 7 days ✓')
      await load(); onChanged?.()
    } catch (e) { toast('Could not extend: ' + (e.message || e)) }
    setBusyId(null)
  }

  async function endNow(r) {
    setBusyId(r.id)
    try {
      const now = new Date().toISOString()
      const { data, error } = await sb.from('demo_requests').update({ status: 'ended', ended_at: now, expires_at: now }).eq('id', r.id).select('id')
      if (error || !data?.length) throw new Error(error?.message || 'nothing was changed')
      if (r.user_id) await sb.from('users').update({ is_active: false }).eq('id', r.user_id)
      toast('Demo ended — their login no longer works ✓')
      await load(); onChanged?.()
    } catch (e) { toast('Could not end it: ' + (e.message || e)) }
    setBusyId(null)
  }

  const shown = rows.filter(r => tab === 'done' ? (r.status === 'ended' || r.status === 'declined') : r.status === tab)
  const count = k => rows.filter(r => k === 'done' ? (r.status === 'ended' || r.status === 'declined') : r.status === k).length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 760, border: '1px solid var(--border)', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🧪 Demo Requests</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>From "Request a demo" on labhive.app · each demo lasts {DEMO_DAYS} days from the person's first sign-in (only you see this)</div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '12px 20px 4px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} className="btn btn-sm" onClick={() => setTab(t.key)}
              style={{ background: tab === t.key ? 'var(--accent-light)' : 'transparent', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', fontWeight: tab === t.key ? 700 : 500 }}>
              {t.label} ({count(t.key)})
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 20px 20px', display: 'grid', gap: 8 }}>
          {loading ? <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          : missing ? (
            <div style={{ fontSize: 13, background: '#fef3c7', color: '#7a4a00', borderRadius: 8, padding: 12 }}>
              Demo requests are not set up in this database yet. Run <b>demo_requests_setup.sql</b> in the Supabase SQL Editor, then reopen this list.
            </div>
          ) : shown.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '18px 0', textAlign: 'center' }}>Nothing here.</div>
          ) : shown.map((r, i) => {
            const busy = busyId === r.id
            return (
              <div key={r.id} style={{ background: i % 2 === 0 ? 'var(--row-a-strong)' : 'var(--row-b-strong)', borderRadius: 10, padding: '12px 14px', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b style={{ fontSize: 14 }}>{r.first_name} {r.last_name}</b>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={chip('#eef0f4', 'var(--text2)')}>{r.org_type}</span>
                    {r.wants_meeting ? <span style={chip('#e0ecff', '#1d4ed8')}>📅 Wants a meeting</span>
                      : r.explore_only === true ? <span style={chip('var(--accent-light)', '#085041')}>Explore features</span>
                      : r.explore_only === false ? <span style={chip('#fef3c7', '#b45309')}>Has questions</span> : null}
                    {r.status === 'new' && <span style={chip('#fef3c7', '#b45309')}>New</span>}
                    {r.status === 'sent' && (r.first_login_at
                      ? <span style={chip('var(--accent-light)', '#085041')}>Active · {daysLeft(r.expires_at)} day{daysLeft(r.expires_at) === 1 ? '' : 's'} left</span>
                      : <span style={chip('#eef0f4', 'var(--text2)')}>Sent · not signed in yet</span>)}
                    {r.status === 'ended' && <span style={chip('#fde8e4', '#c84b2f')}>Ended</span>}
                    {r.status === 'declined' && <span style={chip('#eef0f4', 'var(--text3)')}>Declined</span>}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                  {r.email} · asked {fmtWhen(r.created_at)}
                  {r.sent_at && <> · sent {fmtDate(r.sent_at)}</>}
                  {r.first_login_at && <> · first signed in {fmtDate(r.first_login_at)} · ends {fmtDate(r.expires_at)}</>}
                  {r.extended_days > 0 && <> · extended +{r.extended_days} days</>}
                  {r.ended_at && r.status !== 'sent' && <> · {r.status === 'declined' ? 'declined' : 'ended'} {fmtDate(r.ended_at)}</>}
                </div>
                {r.note && <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>"{r.note}"</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(r.status === 'new' || r.status === 'declined') && (
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => sendAccess(r)}>{busy ? 'Working…' : 'Send demo access'}</button>
                  )}
                  {r.status === 'new' && <button className="btn btn-sm" disabled={busy} onClick={() => decline(r)}>Decline</button>}
                  {(r.status === 'sent' || r.status === 'ended') && <button className="btn btn-sm" disabled={busy} onClick={() => extend(r)}>Extend 7 days</button>}
                  {r.status === 'sent' && <button className="btn btn-sm" disabled={busy} style={{ color: '#c84b2f' }} onClick={() => endNow(r)}>End now</button>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
