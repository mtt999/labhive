import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { StudentsPanel, StaffPanel } from '../profile/Profile'
import ScrollTabs from '../../components/ScrollTabs'
import FloorPlanEditor from '../../components/FloorPlanEditor'

export default function LabManagement() {
  const { session, toast } = useAppStore()
  const [tab, setTab] = useState('students')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="section-title">Lab Management</div>
      </div>
      <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'students',  label: '👥 Lab Users' },
          { key: 'staff',     label: '👨‍💼 Lab Managers' },
          { key: 'floorplan', label: '🗺️ Floor Plan' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 24px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: tab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </ScrollTabs>
      {tab === 'students'  && <StudentsPanel toast={toast} session={session} />}
      {tab === 'staff'     && <StaffPanel    toast={toast} session={session} />}
      {tab === 'floorplan' && <FloorPlanEditor />}
    </div>
  )
}
