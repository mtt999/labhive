import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { buildEmailHtml } from '../../lib/emailTemplate'

async function sendMessageEmail(userId, senderName, messageBody) {
  if (!userId) return
  const { data: prefs } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle()
  if (!prefs || prefs['email_message_reply'] !== true) return
  const { data: user } = await sb.from('users').select('phone, email, organization_id').eq('id', userId).maybeSingle()
  const toEmail = user?.phone || user?.email
  if (!toEmail) return
  let orgContact = null
  if (user?.organization_id) {
    const { data: org } = await sb.from('organizations').select('contact_name, contact_email').eq('id', user.organization_id).maybeSingle()
    orgContact = org
  }
  const title = `New message from ${senderName}`
  const body = messageBody.slice(0, 200) + (messageBody.length > 200 ? '…' : '')
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Message in iLab →', ctaUrl: 'https://labhive.app/?screen=remessages', prefsUrl: 'https://labhive.app/?screen=profile', orgContact })
  const { error } = await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: userId, type: 'message_reply' })
  if (error) console.warn('Message email queue failed:', error.message)
}

function canEdit(s) { return s?.role === 'admin' || s?.role === 'user' }

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diff = (now - date) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function ComposeForm({ session, staff, onSent, onCancel }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState({ receiverId: '', subject: '', body: '' })
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)
  const isAdmin = session?.role === 'admin'
  const isStaff = session?.role === 'user'
  const isStudent = session?.role === 'student'

  async function send() {
    if (!form.body.trim()) { toast('Message body is required.'); return }
    if (isStudent && !form.receiverId) { toast('Please select a receiver.'); return }
    setSending(true)
    let fileUrl = null, fileName = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `re_messages/${Date.now()}_${session.userId}.${ext}`
      const { data: upload, error } = await sb.storage.from('lab-files').upload(path, file)
      if (!error) {
        const { data: url } = sb.storage.from('lab-files').getPublicUrl(path)
        fileUrl = url.publicUrl; fileName = file.name
      }
    }
    const receiver = staff.find(s => s.id === form.receiverId)
    await sb.from('re_messages').insert({
      sender_id: session.userId, sender_name: session.username,
      receiver_id: form.receiverId || null,
      receiver_name: receiver?.name || (isAdmin || isStaff ? 'All Staff' : null),
      subject: form.subject || null, body: form.body.trim(), file_url: fileUrl, file_name: fileName,
      organization_id: session?.organizationId || null,
    })
    if (form.receiverId) {
      await sendMessageEmail(form.receiverId, session.username, form.body.trim())
    }
    toast('Message sent ✓')
    setForm({ receiverId: '', subject: '', body: '' }); setFile(null); setSending(false)
    onSent()
  }

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>New message</div>
      <div className="field">
        <label>To {isStudent ? '*' : '(leave blank to send to all staff)'}</label>
        <select value={form.receiverId} onChange={e => setForm(f => ({ ...f, receiverId: e.target.value }))}>
          <option value="">— {isStudent ? 'Select receiver' : 'All staff (broadcast)'} —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role === 'admin' ? 'Admin' : 'RE/Staff'})</option>)}
        </select>
      </div>
      <div className="field">
        <label>Subject (optional)</label>
        <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Question about booking, App issue…" />
      </div>
      <div className="field">
        <label>Message *</label>
        <textarea rows={5} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Write your message, idea, question, or issue here…" style={{ resize: 'vertical' }} />
      </div>
      <div className="field">
        <label>Attach file (optional)</label>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>📎 {file ? file.name : 'Choose file'}</button>
          {file && <button className="btn btn-sm btn-danger" onClick={() => setFile(null)}>✕</button>}
        </div>
        {file && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

export default function REMessages() {
  const { session, toast, setScreen } = useAppStore()
  const [messages, setMessages] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('inbox')
  const [showCompose, setShowCompose] = useState(false)
  const [editMsg, setEditMsg] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [fromEquipScan] = useState(() => {
    const flag = sessionStorage.getItem('ilab_return_scan') === '1'
    if (flag) sessionStorage.removeItem('ilab_return_scan')
    return flag
  })

  const isAdmin = session?.role === 'admin'
  const isStaff = session?.role === 'user'
  const isStudent = session?.role === 'student'

  useEffect(() => { load() }, [tab])
  useEffect(() => { loadStaff() }, [])

  async function loadStaff() {
    let q = sb.from('users').select('id, name, role').in('role', ['user', 'admin']).eq('is_active', true).order('name')
    if (session?.organizationId && session?.userId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStaff(data || [])
  }

  async function load() {
    setLoading(true)
    let query = sb.from('re_messages').select('*').order('created_at', { ascending: false })
    if (!isAdmin) {
      query = query.or(`receiver_id.eq.${session.userId},sender_id.eq.${session.userId}`)
      if (session?.organizationId) query = query.eq('organization_id', session.organizationId)
    } else if (session?.organizationId && session?.userId) {
      query = query.eq('organization_id', session.organizationId)
    }
    const { data } = await query
    setMessages(data || [])
    setLoading(false)
  }

  async function saveEdit() {
    if (!editMsg.body.trim()) return
    await sb.from('re_messages').update({ body: editMsg.body, subject: editMsg.subject, edited: true, edited_at: new Date().toISOString() }).eq('id', editMsg.id)
    toast('Message updated ✓'); setEditMsg(null); load()
  }

  async function deleteMsg(id) {
    await sb.from('re_messages').delete().eq('id', id)
    toast('Message deleted.'); setDeleteConfirm(null); load()
  }

  const inbox = messages.filter(m => isAdmin || m.receiver_id === session?.userId || (!m.receiver_id && (isAdmin || isStaff)))
  const sent = messages.filter(m => m.sender_id === session?.userId)
  const displayed = tab === 'sent' ? sent : (isAdmin ? messages : inbox)

  function canEditMsg(m) { return isAdmin || (isStaff && m.sender_id === session?.userId) }
  function canDeleteMsg(m) { return isAdmin || (isStaff && m.sender_id === session?.userId) }

  return (
    <div>
      {fromEquipScan && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setScreen('equipmentscan')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #b2dfcb', background: '#e8f2ee', fontSize: 13, fontWeight: 700, color: '#2a6049', cursor: 'pointer' }}
          >
            ← Back to options
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="section-title">Contact Lab Manager (REs)</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Notes, ideas, questions & issue reports</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCompose(true)}>+ New message</button>
      </div>

      {showCompose && (
        <div style={{ marginBottom: 20 }}>
          <ComposeForm session={session} staff={staff}
            onSent={() => { setShowCompose(false); setTab('sent'); load() }}
            onCancel={() => setShowCompose(false)} />
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { key: isAdmin ? 'all' : 'inbox', label: isAdmin ? 'All messages' : 'Inbox' },
          { key: 'sent', label: 'Sent' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : displayed.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">💬</div>No messages yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map((m) => (
            <div key={m.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-light)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                      {(m.sender_name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{m.sender_name}</span>
                      {m.receiver_name && <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 6 }}>→ {m.receiver_name}</span>}
                      {!m.receiver_id && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 3, padding: '1px 6px' }}>Broadcast</span>}
                    </div>
                  </div>
                  {m.subject && <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{m.subject}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                    {fmtDate(m.created_at)}{m.edited && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>(edited)</span>}
                  </div>
                  {canEditMsg(m) && <button className="btn btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEditMsg({ ...m })}>Edit</button>}
                  {canDeleteMsg(m) && <button className="btn btn-sm btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setDeleteConfirm(m.id)}>✕</button>}
                </div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: m.file_url ? 10 : 0 }}>{m.body}</div>
              {m.file_url && (
                <a href={m.file_url} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', marginTop: 8, textDecoration: 'none', background: 'var(--accent-light)', borderRadius: 6, padding: '4px 10px' }}>
                  📎 {m.file_name || 'View attachment'}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {editMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Edit message</div>
            <div className="field"><label>Subject</label><input value={editMsg.subject || ''} onChange={e => setEditMsg(m => ({ ...m, subject: e.target.value }))} /></div>
            <div className="field"><label>Message</label><textarea rows={5} value={editMsg.body} onChange={e => setEditMsg(m => ({ ...m, body: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveEdit}>Save changes</button>
              <button className="btn" onClick={() => setEditMsg(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 360, width: '100%', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Delete this message?</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMsg(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
