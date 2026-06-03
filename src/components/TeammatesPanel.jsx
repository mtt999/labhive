import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

export default function TeammatesPanel({ session }) {
  const { toast, setSharedWorkspaces, sharedWorkspaces } = useAppStore()
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [outgoing, setOutgoing] = useState([])
  const [incoming, setIncoming] = useState([])
  const [members, setMembers] = useState([])

  useEffect(() => { load() }, [session?.userId])

  async function load() {
    if (!session?.userId) return

    const { data: out } = await sb
      .from('solo_workspace_invites')
      .select('id, invitee_email, status, created_at')
      .eq('owner_id', session.userId)
      .order('created_at', { ascending: false })
    setOutgoing(out || [])

    if (session?.email) {
      const { data: inc } = await sb
        .from('solo_workspace_invites')
        .select('id, owner_id, status, created_at')
        .eq('invitee_email', session.email.toLowerCase())
        .eq('status', 'pending')
      if (inc?.length) {
        const { data: owners } = await sb.from('solo_users').select('id, name').in('id', inc.map(i => i.owner_id))
        const ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o.name]))
        setIncoming(inc.map(i => ({ ...i, ownerName: ownerMap[i.owner_id] || 'Unknown' })))
      } else {
        setIncoming([])
      }
    }

    const { data: mems } = await sb
      .from('solo_workspace_members')
      .select('member_id')
      .eq('owner_id', session.userId)
    if (mems?.length) {
      const { data: memberUsers } = await sb.from('solo_users').select('id, name, email').in('id', mems.map(m => m.member_id))
      const memberMap = Object.fromEntries((memberUsers || []).map(u => [u.id, u]))
      setMembers(mems.map(m => ({ memberId: m.member_id, user: memberMap[m.member_id] || null })))
    } else {
      setMembers([])
    }
  }

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    if (email === session?.email?.toLowerCase()) { toast('You cannot invite yourself.'); return }
    if (outgoing.some(i => i.invitee_email === email && i.status !== 'declined')) {
      toast('Already invited this email.'); return
    }
    setSending(true)
    const { error } = await sb.from('solo_workspace_invites').insert({
      owner_id: session.userId,
      invitee_email: email,
      status: 'pending',
    })
    if (error) {
      toast(error.code === '23505' ? 'Already invited this email.' : 'Error sending invite.')
    } else {
      toast('Invite sent!')
      setInviteEmail('')
    }
    setSending(false)
    load()
  }

  async function acceptInvite(invite) {
    const { error } = await sb.from('solo_workspace_members').insert({
      owner_id: invite.owner_id,
      member_id: session.userId,
    })
    if (error && error.code !== '23505') { toast('Error joining workspace.'); return }
    await sb.from('solo_workspace_invites').update({ status: 'accepted' }).eq('id', invite.id)
    toast(`Joined ${invite.ownerName}'s workspace!`)
    const alreadyIn = sharedWorkspaces.some(ws => ws.ownerId === invite.owner_id)
    if (!alreadyIn) {
      setSharedWorkspaces([...sharedWorkspaces, { ownerId: invite.owner_id, ownerName: invite.ownerName }])
    }
    load()
  }

  async function declineInvite(invite) {
    await sb.from('solo_workspace_invites').update({ status: 'declined' }).eq('id', invite.id)
    toast('Invite declined.')
    load()
  }

  async function removeMember(memberId) {
    if (!confirm('Remove this teammate from your workspace?')) return
    await sb.from('solo_workspace_members').delete().eq('owner_id', session.userId).eq('member_id', memberId)
    const memberUser = members.find(m => m.memberId === memberId)?.user
    if (memberUser?.email) {
      await sb.from('solo_workspace_invites').delete().eq('owner_id', session.userId).eq('invitee_email', memberUser.email.toLowerCase())
    }
    toast('Teammate removed.')
    load()
  }

  async function revokeInvite(inviteId) {
    await sb.from('solo_workspace_invites').delete().eq('id', inviteId)
    toast('Invite revoked.')
    load()
  }

  async function leaveWorkspace(ws) {
    if (!confirm(`Leave ${ws.ownerName}'s workspace?`)) return
    await sb.from('solo_workspace_members').delete().eq('owner_id', ws.ownerId).eq('member_id', session.userId)
    setSharedWorkspaces(sharedWorkspaces.filter(w => w.ownerId !== ws.ownerId))
    toast(`Left ${ws.ownerName}'s workspace.`)
    load()
  }

  const statusStyle = (s) => ({
    fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px',
    background: s === 'accepted' ? '#e8f2ee' : s === 'declined' ? '#fde8e8' : '#fef3c7',
    color:      s === 'accepted' ? '#0f6e56' : s === 'declined' ? '#b91c1c' : '#92400e',
  })

  return (
    <div>
      {incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#534AB7' }}>
            Pending workspace invites for you
          </div>
          {incoming.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #CECBF6', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.ownerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  wants to share their Projects &amp; Materials with you
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-sm btn-primary" style={{ background: '#534AB7', borderColor: '#534AB7' }} onClick={() => acceptInvite(inv)}>Accept</button>
                <button className="btn btn-sm" onClick={() => declineInvite(inv)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Invite a teammate</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Enter their LabHive Solo email. They can accept from Profile → Teammates, then view your Projects and Materials tabs.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="teammate@email.com"
            onKeyDown={e => e.key === 'Enter' && sendInvite()}
            style={{ flex: 1 }}
          />
          <button
            onClick={sendInvite}
            disabled={sending || !inviteEmail.trim()}
            style={{ padding: '0 20px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: sending || !inviteEmail.trim() ? 'not-allowed' : 'pointer', opacity: sending || !inviteEmail.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
          My Teammates — {members.length} {members.length === 1 ? 'person' : 'people'} can see your workspace
        </div>
        {members.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>No teammates yet. Use the invite form above.</div>
          : members.map(m => (
            <div key={m.memberId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{m.user?.name || 'Unknown'}</div>
                {m.user?.email && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{m.user.email}</div>}
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.memberId)}>Remove</button>
            </div>
          ))
        }
      </div>

      {sharedWorkspaces.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Workspaces I joined</div>
          {sharedWorkspaces.map(ws => (
            <div key={ws.ownerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{ws.ownerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Switch to their workspace from the Projects screen</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => leaveWorkspace(ws)}>Leave</button>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Sent invites</div>
          {outgoing.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.invitee_email}</div>
                <span style={statusStyle(inv.status)}>{inv.status}</span>
              </div>
              {inv.status === 'pending' && (
                <button className="btn btn-sm" onClick={() => revokeInvite(inv.id)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
