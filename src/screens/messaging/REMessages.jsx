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
  const htmlBody = buildEmailHtml({ title, body, ctaLabel: 'View Message in LabHive →', ctaUrl: 'https://labhive.app/?screen=remessages', prefsUrl: 'https://labhive.app/?screen=profile', orgContact })
  await sb.from('email_notifications_queue').insert({ to_email: toEmail, subject: title, body, html_body: htmlBody, user_id: userId, type: 'message_reply' })
}

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diff = (now - date) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function Avatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--accent-light)', border: '1.5px solid var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.floor(size * 0.38), fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

function NewConvModal({ session, staff, onSent, onClose }) {
  const { toast } = useAppStore()
  const [form, setForm] = useState({ receiverId: '', subject: '', body: '' })
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)
  const isStudent = session?.role === 'student'

  async function send() {
    if (!form.body.trim()) { toast('Message is required.'); return }
    if (isStudent && !form.receiverId) { toast('Please select who to send to.'); return }
    setSending(true)
    let fileUrl = null, fileName = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `re_messages/${Date.now()}_${session.userId}.${ext}`
      const { error } = await sb.storage.from('lab-files').upload(path, file)
      if (!error) {
        const { data: url } = sb.storage.from('lab-files').getPublicUrl(path)
        fileUrl = url.publicUrl; fileName = file.name
      }
    }
    const receiver = staff.find(s => s.id === form.receiverId)
    await sb.from('re_messages').insert({
      sender_id: session.userId, sender_name: session.username,
      receiver_id: form.receiverId || null,
      receiver_name: receiver?.name || (!form.receiverId ? 'All Staff' : null),
      subject: form.subject || null, body: form.body.trim(),
      file_url: fileUrl, file_name: fileName,
      organization_id: session?.organizationId || null,
      is_read: false,
    })
    if (form.receiverId) await sendMessageEmail(form.receiverId, session.username, form.body.trim())
    toast('Message sent ✓')
    setSending(false)
    onSent()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 520, width: '100%', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>New conversation</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div className="field">
          <label>To {isStudent ? '*' : '(leave blank to broadcast to all staff)'}</label>
          <select value={form.receiverId} onChange={e => setForm(f => ({ ...f, receiverId: e.target.value }))}>
            <option value="">— {isStudent ? 'Select recipient' : 'All staff (broadcast)'} —</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role === 'admin' ? 'Admin' : 'Staff'})</option>)}
          </select>
        </div>
        <div className="field">
          <label>Subject (optional)</label>
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Equipment question, Booking issue…" />
        </div>
        <div className="field">
          <label>Message *</label>
          <textarea rows={4} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Write your message here…" style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>📎 {file ? file.name : 'Attach file'}</button>
          {file && <button className="btn btn-sm btn-danger" onClick={() => setFile(null)}>✕</button>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function REMessages() {
  const { session, toast, setScreen } = useAppStore()
  const [conversations, setConversations] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showCompose, setShowCompose] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState(null)
  const [sendingReply, setSendingReply] = useState(false)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const threadRef = useRef(null)
  const replyFileRef = useRef(null)
  const textareaRef = useRef(null)

  const [fromEquipScan] = useState(() => {
    const flag = sessionStorage.getItem('ilab_return_scan') === '1'
    if (flag) sessionStorage.removeItem('ilab_return_scan')
    return flag
  })

  const isAdmin = session?.role === 'admin'
  const isStaff = session?.role === 'user'
  const selectedConv = conversations.find(c => c.id === selectedId) || null

  useEffect(() => { load(); loadStaff() }, [])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [selectedId, selectedConv?.replies?.length])

  async function loadStaff() {
    let q = sb.from('users').select('id, name, role').in('role', ['user', 'admin']).eq('is_active', true).order('name')
    if (session?.organizationId && session?.userId) q = q.eq('organization_id', session.organizationId)
    const { data } = await q
    setStaff(data || [])
  }

  async function load() {
    setLoading(true)
    let q = sb.from('re_messages').select('*').order('created_at', { ascending: true })
    if (!isAdmin) {
      q = q.or(`receiver_id.eq.${session.userId},sender_id.eq.${session.userId}`)
      if (session?.organizationId) q = q.eq('organization_id', session.organizationId)
    } else if (session?.organizationId && session?.userId) {
      q = q.eq('organization_id', session.organizationId)
    }
    const { data } = await q
    buildConversations(data || [])
    setLoading(false)
  }

  function buildConversations(msgs) {
    const roots = msgs.filter(m => !m.parent_id)
    const replies = msgs.filter(m => m.parent_id)
    const convs = roots.map(r => {
      const threadReplies = replies
        .filter(x => x.parent_id === r.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const unread = [r, ...threadReplies].filter(m => m.sender_id !== session?.userId && !m.is_read).length
      const lastMsg = threadReplies.length ? threadReplies[threadReplies.length - 1] : r
      return { ...r, replies: threadReplies, unreadCount: unread, lastMessage: lastMsg }
    }).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at))
    setConversations(convs)
  }

  async function markRead(conv) {
    try {
      const ids = [conv, ...conv.replies]
        .filter(m => m.sender_id !== session?.userId && !m.is_read)
        .map(m => m.id)
      if (ids.length) await sb.from('re_messages').update({ is_read: true }).in('id', ids)
    } catch (_) {}
  }

  function selectConv(conv) {
    setSelectedId(conv.id)
    setReplyText('')
    setReplyFile(null)
    setMobileShowThread(true)
    markRead(conv)
    setConversations(cs => cs.map(c => c.id === conv.id
      ? { ...c, is_read: true, unreadCount: 0, replies: c.replies.map(r => ({ ...r, is_read: true })) }
      : c
    ))
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConv || sendingReply) return
    setSendingReply(true)
    let fileUrl = null, fileName = null
    if (replyFile) {
      const ext = replyFile.name.split('.').pop()
      const path = `re_messages/${Date.now()}_${session.userId}.${ext}`
      const { error } = await sb.storage.from('lab-files').upload(path, replyFile)
      if (!error) {
        const { data: url } = sb.storage.from('lab-files').getPublicUrl(path)
        fileUrl = url.publicUrl; fileName = replyFile.name
      }
    }
    const otherId = selectedConv.sender_id === session?.userId
      ? selectedConv.receiver_id
      : selectedConv.sender_id
    const otherName = selectedConv.sender_id === session?.userId
      ? selectedConv.receiver_name
      : selectedConv.sender_name

    const { data: newMsg } = await sb.from('re_messages').insert({
      parent_id: selectedConv.id,
      sender_id: session.userId, sender_name: session.username,
      receiver_id: otherId || null, receiver_name: otherName || null,
      body: replyText.trim(), file_url: fileUrl, file_name: fileName,
      organization_id: session?.organizationId || null,
      is_read: false,
    }).select().single()

    if (otherId) await sendMessageEmail(otherId, session.username, replyText.trim())

    if (newMsg) {
      setConversations(cs => cs.map(c => c.id === selectedId
        ? { ...c, replies: [...c.replies, newMsg], lastMessage: newMsg }
        : c
      ))
    }
    setReplyText('')
    setReplyFile(null)
    setSendingReply(false)
    textareaRef.current?.focus()
  }

  async function deleteMsg(id) {
    await sb.from('re_messages').delete().eq('id', id)
    setDeleteConfirm(null)
    toast('Message deleted.')
    const isRoot = conversations.some(c => c.id === id)
    if (isRoot) {
      setConversations(cs => cs.filter(c => c.id !== id))
      setSelectedId(null)
      setMobileShowThread(false)
    } else {
      setConversations(cs => cs.map(c => ({ ...c, replies: c.replies.filter(r => r.id !== id) })))
    }
  }

  function canDelete(m) {
    return isAdmin || isStaff ? m.sender_id === session?.userId || isAdmin : m.sender_id === session?.userId
  }

  function otherName(conv) {
    if (!conv) return ''
    if (conv.sender_id === session?.userId) return conv.receiver_name || 'All Staff'
    return conv.sender_name || 'Unknown'
  }

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0)

  // Auto-resize textarea
  function handleTextareaInput(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    setReplyText(el.value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <div className={mobileShowThread ? 'msg-header-hide-mobile' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
        <div>
          {fromEquipScan && (
            <button onClick={() => setScreen('equipmentscan')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #b2dfcb', background: '#e8f2ee', fontSize: 13, fontWeight: 700, color: '#2a6049', cursor: 'pointer', marginBottom: 8 }}>
              ← Back to options
            </button>
          )}
          <div className="section-title">Lab Messages</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Notes, ideas, questions &amp; issue reports</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCompose(true)}>+ New</button>
      </div>

      {/* Two-panel container */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>

        {/* LEFT — conversation list */}
        <div className={`msg-panel-left${mobileShowThread ? ' msg-hidden' : ''}`} style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', flexShrink: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              Conversations
              {totalUnread > 0 && (
                <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.4 }}>{totalUnread}</span>
              )}
            </div>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowCompose(true)}>+ New</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 13 }}>No conversations yet</div>
              </div>
            ) : conversations.map(conv => {
              const name = otherName(conv)
              const selected = conv.id === selectedId
              const preview = (conv.lastMessage?.body || '').slice(0, 52) + ((conv.lastMessage?.body?.length || 0) > 52 ? '…' : '')
              return (
                <button key={conv.id} onClick={() => selectConv(conv)} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%',
                  padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                  background: selected ? 'var(--accent-light)' : conv.unreadCount > 0 ? 'rgba(29,158,117,0.035)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}>
                  <Avatar name={name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, marginBottom: 1 }}>
                      <span style={{ fontWeight: conv.unreadCount > 0 ? 700 : 500, fontSize: 13, color: selected ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0, fontFamily: 'var(--mono)' }}>{fmtDate(conv.lastMessage?.created_at)}</span>
                    </div>
                    {conv.subject && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--text2)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.subject}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{preview}</span>
                      {conv.unreadCount > 0 && (
                        <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 5px', flexShrink: 0, lineHeight: 1.4 }}>{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — thread */}
        <div className={`msg-panel-right${!mobileShowThread ? ' msg-hidden' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: selectedConv ? 'var(--bg)' : 'var(--surface)' }}>
          {!selectedConv ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 52, marginBottom: 12, opacity: 0.5 }}>💬</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: 'var(--text2)' }}>Select a conversation</div>
              <div style={{ fontSize: 13 }}>or tap <strong>+ New</strong> to start one</div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', flexShrink: 0 }}>
                <button className="msg-back-btn" onClick={() => { setMobileShowThread(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--accent)', padding: '0 4px', lineHeight: 1, flexShrink: 0, display: 'none' }}>←</button>
                <Avatar name={otherName(selectedConv)} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{otherName(selectedConv)}</div>
                  {selectedConv.subject && <div style={{ fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedConv.subject}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {selectedConv.replies.length + 1} msg{selectedConv.replies.length !== 0 ? 's' : ''}
                </div>
              </div>

              {/* Bubbles */}
              <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[selectedConv, ...selectedConv.replies].map((m, i, all) => {
                  const isOwn = m.sender_id === session?.userId
                  const prevSame = i > 0 && all[i - 1].sender_id === m.sender_id
                  const nextSame = i < all.length - 1 && all[i + 1].sender_id === m.sender_id
                  return (
                    <div key={m.id}>
                      {/* Date separator or sender label */}
                      {!prevSame && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${i === 0 ? 0 : 10}px 0 6px`, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                          {!isOwn && <Avatar name={m.sender_name} size={22} />}
                          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
                            {isOwn ? 'You' : m.sender_name}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: nextSame ? 2 : 8 }}>
                        <div style={{ maxWidth: '72%' }}>
                          <div style={{
                            background: isOwn ? 'var(--accent)' : 'var(--surface)',
                            color: isOwn ? '#fff' : 'var(--text)',
                            borderRadius: isOwn
                              ? (prevSame ? '18px 4px 4px 18px' : nextSame ? '18px 18px 4px 18px' : '18px 4px 18px 18px')
                              : (prevSame ? '4px 18px 18px 4px' : nextSame ? '18px 18px 18px 4px' : '4px 18px 18px 18px'),
                            padding: '9px 14px',
                            fontSize: 14, lineHeight: 1.6,
                            border: isOwn ? 'none' : '1px solid var(--border)',
                            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                            boxShadow: isOwn ? '0 2px 8px rgba(42,96,73,0.18)' : '0 1px 3px rgba(0,0,0,0.06)',
                          }}>
                            {m.body}
                          </div>
                          {m.file_url && (
                            <a href={m.file_url} target="_blank" rel="noopener" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, marginTop: 4,
                              color: isOwn ? 'var(--accent)' : 'var(--accent)',
                              background: 'var(--accent-light)', borderRadius: 6, padding: '3px 9px', textDecoration: 'none',
                            }}>
                              📎 {m.file_name || 'Attachment'}
                            </a>
                          )}
                          {!nextSame && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtDate(m.created_at)}</span>
                              {canDelete(m) && (
                                <button onClick={() => setDeleteConfirm(m.id)} title="Delete" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text3)', padding: 0, opacity: 0.55, lineHeight: 1 }}>✕</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply bar */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                {replyFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 10px', background: 'var(--accent-light)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                    📎 <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyFile.name}</span>
                    <button onClick={() => setReplyFile(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text3)', flexShrink: 0 }}>✕</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input ref={replyFileRef} type="file" style={{ display: 'none' }} onChange={e => setReplyFile(e.target.files[0])} />
                  <button onClick={() => replyFileRef.current?.click()} title="Attach file" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📎</button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={replyText}
                    onInput={handleTextareaInput}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    placeholder="Reply… (Enter to send, Shift+Enter for new line)"
                    style={{ flex: 1, borderRadius: 20, border: '1px solid var(--border)', padding: '8px 14px', fontSize: 14, resize: 'none', background: 'var(--surface)', color: 'var(--text)', lineHeight: 1.5, height: 38, maxHeight: 120, overflowY: 'auto', outline: 'none', fontFamily: 'var(--sans)', transition: 'border-color 0.15s' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sendingReply || !replyText.trim()}
                    title="Send (Enter)"
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: replyText.trim() ? 'var(--accent)' : 'var(--border)', color: replyText.trim() ? '#fff' : 'var(--text3)', cursor: replyText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, transition: 'all 0.15s', flexShrink: 0, fontWeight: 700 }}
                  >
                    {sendingReply ? <span style={{ fontSize: 11 }}>…</span> : '↑'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showCompose && (
        <NewConvModal session={session} staff={staff} onSent={() => { setShowCompose(false); load() }} onClose={() => setShowCompose(false)} />
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 320, width: '100%', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Delete this message?</div>
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
