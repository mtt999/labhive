import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { StudentsPanel, StaffPanel, ApprovalRequestsPanel } from '../profile/Profile'
import ScrollTabs from '../../components/ScrollTabs'
import { sb } from '../../lib/supabase'

export default function LabManagement() {
  const { session, toast } = useAppStore()
  const [tab, setTab] = useState('students')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => { loadPendingCount() }, [])

  async function loadPendingCount() {
    if (!session?.organizationId) return
    const { count } = await sb.from('account_deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  const approvalLabel = pendingCount > 0
    ? `📋 Approval Requests (${pendingCount})`
    : '📋 Approval Requests'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Lab Management</div>
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'students',  label: '👥 Lab Users' },
          { key: 'staff',     label: '👨‍💼 Lab Managers' },
          { key: 'approvals', label: approvalLabel },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : pendingCount > 0 && t.key === 'approvals' ? '#b91c1c' : 'var(--text2)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {tab === 'students'  && <StudentsPanel toast={toast} session={session} />}
      {tab === 'staff'     && <StaffPanel    toast={toast} session={session} />}
      {tab === 'approvals' && <ApprovalRequestsPanel toast={toast} session={session} onCountChange={setPendingCount} />}
    </div>
  )
}
