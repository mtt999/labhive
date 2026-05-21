import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import { ALL_MODULES_META, PINNED_MODULES } from '../../components/DashboardIconPicker'

function getModules(role, loginMode, activeModules) {
  const roleKey = loginMode === 'solo' ? 'solo' : 'team'
  const isStaff = role === 'admin' || role === 'user'
  const studentAllowed = ['projects','training','booking','equipmenthub','mileage','labsafety','remessages','barcode','profile']
  const base = ALL_MODULES_META.filter(m => {
    if (!m.roles.includes(roleKey)) return false
    if (role === 'student' && !studentAllowed.includes(m.key)) return false
    if (m.adminOnly && !isStaff) return false
    if (m.hideForStaff && isStaff) return false
    return true
  })
  if (activeModules && activeModules.length > 0) {
    const baseMap = Object.fromEntries(base.map(m => [m.key, m]))
    const ordered = []
    activeModules.forEach(k => { if (baseMap[k]) ordered.push(baseMap[k]) })
    PINNED_MODULES.forEach(k => { if (baseMap[k] && !activeModules.includes(k)) ordered.push(baseMap[k]) })
    if (role === 'admin') base.forEach(m => { if (m.adminOnly && !activeModules.includes(m.key)) ordered.push(m) })
    return ordered
  }
  return base
}

function getAllModulesForStudent() {
  return [
    { key: 'supply',       screen: 'home',          label: 'Supply Inventory',          sub: 'Weekly inspection & export',       icon: '📦', bg: '#e8f2ee', color: '#2a6049' },
    { key: 'projects',     screen: 'projects',      label: 'Project & Material',        sub: 'Inventory, results & workspace',   icon: '🧪', bg: '#f3eeff', color: '#7c4dbd' },
    { key: 'training',     screen: 'training',      label: 'Training Records',          sub: 'Certs, equipment & alarm',         icon: '🎓', bg: '#e0f2fe', color: '#0369a1' },
    { key: 'equipment',    screen: 'equipment',     label: 'Equipment Inventory',       sub: 'Lab equipment tracking',           icon: '🔧', bg: '#fef3c7', color: '#92400e', locked: true },
    { key: 'equipmenthub', screen: 'equipmenthub',  label: 'Equipment',                 sub: 'Info, SOP & standards',            icon: '📚', bg: '#e8f2ee', color: '#1e4d39' },
    { key: 'booking',      screen: 'booking',       label: 'Booking Equipment',         sub: 'Reserve lab equipment',            icon: '📅', bg: '#e0f2fe', color: '#0369a1' },
    { key: 'barcode',      screen: 'barcode',       label: 'QR Scan',                   sub: 'Scan & look up lab materials',     icon: '📷', bg: '#e0f7fa', color: '#00796b' },
    { key: 'mileage',      screen: null,            label: 'Mileage Form',              sub: 'Submit mileage reimbursement',     icon: '🚗', bg: '#fdf0ed', color: '#c84b2f', external: true },
    { key: 'labsafety',    screen: null,            label: 'Lab Safety',                sub: 'Safety training & certification',  icon: '🦺', bg: '#fef3c7', color: '#92400e', external: true },
    { key: 'remessages',   screen: 'remessages',    label: 'Contact Lab Manager (REs)', sub: 'Notes, ideas & issue reports',     icon: '💬', bg: '#e8f2ee', color: '#2a6049' },
    { key: 'pm',           screen: 'pm',            label: 'Project Management',        sub: 'Tasks, meetings & team chat',      icon: '📋', bg: '#fff3e0', color: '#ff6b00', locked: true },
    { key: 'profile',      screen: 'profile',       label: 'Profile',                   sub: 'Your info & settings',             icon: '👤', bg: '#f3eeff', color: '#7c4dbd' },
    { key: 'barcodeqr',   screen: 'barcodeqr',     label: 'QR Scan',                   sub: 'Equipment QR code management',     icon: '🔲', bg: '#f0f4ff', color: '#1a56db', locked: true },
  ]
}

function ExternalLinkModal({ url, onConfirm, onCancel }) {
  const hasUrl = url && url.trim() && url.startsWith('http')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>{hasUrl ? '🔗' : '⚠️'}</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>{hasUrl ? 'Leaving InteleLab' : 'Link not configured'}</div>
        {hasUrl ? (
          <>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8, textAlign: 'center' }}>You are being redirected to an external website:</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all', textAlign: 'center' }}>{url}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>Continue →</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20, textAlign: 'center' }}>The admin has not set up a URL for this link yet. Please contact your lab manager.</div>
            <button className="btn" style={{ width: '100%' }} onClick={onCancel}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

function ModuleCard({ m, onClick, imgUrl, isAdminManage }) {
  return (
    <a
      href="#"
      onClick={e => { e.preventDefault(); onClick?.() }}
      onTouchEnd={e => { e.preventDefault(); onClick?.() }}
      style={{
        display: 'block',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: isAdminManage ? '1px dashed var(--border)' : '1px solid var(--border)',
        transition: 'box-shadow 0.15s',
        position: 'relative',
        height: 160,
        backgroundColor: m.bg,
        backgroundImage: imgUrl ? `url(${imgUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        textDecoration: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: imgUrl ? 'linear-gradient(to top, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.15) 100%)' : 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 100%)', pointerEvents: 'none' }} />
      {m.external && <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 10, borderRadius: 4, padding: '2px 6px', pointerEvents: 'none' }}>↗ External</div>}
      {isAdminManage && <div style={{ position: 'absolute', top: 10, right: 10, background: m.color, color: '#fff', fontSize: 10, borderRadius: 4, padding: '2px 8px', fontWeight: 600, pointerEvents: 'none' }}>⚙ Edit</div>}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 14px', pointerEvents: 'none' }}>
        {!imgUrl && <div style={{ fontSize: 28, marginBottom: 6 }}>{m.icon}</div>}
        <div style={{ fontWeight: 700, fontSize: 14, color: imgUrl ? '#fff' : m.color, textShadow: imgUrl ? '0 2px 6px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)' : 'none', marginBottom: 2 }}>{m.label}</div>
        <div style={{ fontSize: 11, color: imgUrl ? 'rgba(255,255,255,0.9)' : m.color, opacity: imgUrl ? 1 : 0.75, textShadow: imgUrl ? '0 1px 4px rgba(0,0,0,0.8)' : 'none' }}>{isAdminManage ? 'Click to manage link' : m.sub}</div>
      </div>
    </a>
  )
}

function LockedCard({ m }) {
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', height: 160, cursor: 'not-allowed' }}>
      <div style={{ position: 'absolute', inset: 0, background: m.bg, filter: 'blur(2px)', opacity: 0.5, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
        <div style={{ fontSize: 22, filter: 'grayscale(1)', opacity: 0.4 }}>{m.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>{m.label}</div>
        <div style={{ fontSize: 10, color: '#aaa' }}>🔒 Lab managers only</div>
      </div>
    </div>
  )
}

function CardGridView({ modules, onNavigate, mileageUrl, labSafetyUrl, isAdmin, onEditUrl, moduleImages, isStudent, activeModules, studentAccess, studentAllowedPool }) {
  const [confirmExternal, setConfirmExternal] = useState(null)

  if (isStudent) {
    const allMods = getAllModulesForStudent()
    // Respect activeModules: hide unchecked non-locked cards
    const visibleMods = activeModules?.length
      ? allMods.filter(m => m.locked || activeModules.includes(m.key))
      : allMods
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {visibleMods.map(m => {
            const grantedByAdmin = m.locked && ((m.screen && studentAccess?.has(m.screen)) || studentAllowedPool?.has(m.key))
            if (m.locked && !grantedByAdmin) return <LockedCard key={m.key} m={m} />
            return <ModuleCard key={m.key} m={m} imgUrl={moduleImages[m.key]} onClick={() => m.external ? setConfirmExternal({ url: m.key === 'mileage' ? mileageUrl : labSafetyUrl }) : onNavigate(m.screen)} />
          })}
        </div>
        {confirmExternal && <ExternalLinkModal url={confirmExternal.url} onConfirm={() => { window.open(confirmExternal.url, '_blank'); setConfirmExternal(null) }} onCancel={() => setConfirmExternal(null)} />}
      </>
    )
  }

  const adminManageCards = [
    { key: 'mileage',   icon: '🚗', label: 'Mileage Form', sub: 'Manage link', bg: '#fdf0ed', color: '#c84b2f', screen: null },
    { key: 'labsafety', icon: '🦺', label: 'Lab Safety',   sub: 'Manage link', bg: '#fef3c7', color: '#92400e', screen: null },
  ].filter(card => !activeModules || activeModules.includes(card.key))

  const visibleModules = isAdmin ? modules.filter(m => !m.external) : modules

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {visibleModules.map(m => <ModuleCard key={m.key} m={m} imgUrl={moduleImages[m.key]} onClick={() => m.external ? setConfirmExternal({ url: m.key === 'mileage' ? mileageUrl : labSafetyUrl }) : onNavigate(m.screen)} />)}
        {isAdmin && adminManageCards.map(card => <ModuleCard key={card.key} m={card} imgUrl={moduleImages[card.key]} isAdminManage onClick={() => onEditUrl(card.key)} />)}
      </div>
      {confirmExternal && <ExternalLinkModal url={confirmExternal.url} onConfirm={() => { window.open(confirmExternal.url, '_blank'); setConfirmExternal(null) }} onCancel={() => setConfirmExternal(null)} />}
    </>
  )
}

function StudentDashboardView({ session, onNavigate, mileageUrl, moduleImages, activeModules }) {
  const [data, setData] = useState({ myProjects: 0, trainingsComplete: 0, trainingsTotal: 4, upcomingBookings: [], pendingCert: false })
  const [loading, setLoading] = useState(true)
  const [confirmExternal, setConfirmExternal] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  useEffect(() => { if (session?.userId) loadStudentData() }, [session?.userId])
  async function loadStudentData() {
    setLoading(true)
    try {
      const userId = session.userId; const userName = session.username
      let projQ = sb.from('projects').select('id,title,status').or(`students.cs.{"${userName}"},students.ilike.%${userName}%`).eq('status','active')
      if (session?.organizationId) projQ = projQ.eq('organization_id', session.organizationId)
      const { data: projects } = await projQ
      const [freshRes,golfRes,alarmRes,eqRes,pendingRes,bookingsRes] = await Promise.all([
        sb.from('training_fresh').select('id,admin_approved').eq('user_id',userId).maybeSingle(),
        sb.from('training_golf_car').select('id').eq('user_id',userId).maybeSingle(),
        sb.from('training_building_alarm').select('id').eq('user_id',userId).maybeSingle(),
        sb.from('training_equipment').select('id').eq('user_id',userId).limit(1),
        sb.from('training_fresh').select('id').eq('user_id',userId).eq('admin_approved',false).maybeSingle(),
        sb.from('equipment_bookings').select('id,equipment_name,start_time,end_time,status').eq('user_id',userId).gte('start_time',new Date().toISOString()).order('start_time').limit(3),
      ])
      let done = 0
      if (freshRes.data?.admin_approved) done++
      if (golfRes.data) done++
      if (alarmRes.data) done++
      if (eqRes.data?.length) done++
      setData({ myProjects: projects?.length||0, trainingsComplete: done, trainingsTotal: 4, upcomingBookings: bookingsRes.data||[], pendingCert: !!pendingRes.data })
    } catch(e) {}
    setLoading(false)
  }
  const trainingPct = Math.round((data.trainingsComplete/data.trainingsTotal)*100)
  const trainingColor = trainingPct===100?'#2a6049':trainingPct>=50?'#0369a1':'#c84b2f'
  const allQuickLinks = [
    { key:'projects',    icon:'🧪', label:'Project & Material',   sub:'Inventory, results & workspace', screen:'projects',    color:'#7c4dbd' },
    { key:'training',    icon:'🎓', label:'Training Records',     sub:'Check your certs',               screen:'training',    color:'#0369a1' },
    { key:'booking',     icon:'📅', label:'Book Equipment',       sub:'Reserve lab equipment',          screen:'booking',     color:'#0369a1' },
    { key:'equipmenthub',icon:'📚', label:'Equipment Info',       sub:'SOPs & standards',               screen:'equipmenthub',color:'#1e4d39' },
    { key:'barcode',     icon:'📷', label:'QR Scan',               sub:'Scan lab materials',             screen:'barcode',     color:'#00796b' },
    { key:'remessages',  icon:'💬', label:'Contact Lab Manager',  sub:'Ask REs a question',             screen:'remessages',  color:'#2a6049' },
    { key:'mileage',     icon:'🚗', label:'Mileage Form',         sub:'Submit reimbursement',           screen:null,          color:'#c84b2f', external:true },
  ]
  const quickLinks = activeModules?.length
    ? allQuickLinks.filter(m => activeModules.includes(m.key))
    : allQuickLinks
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 260px', gap:20, alignItems:'start' }}>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
            {[{label:'My active projects',val:data.myProjects,color:'#7c4dbd',screen:'projects'},{label:'Trainings complete',val:`${data.trainingsComplete}/${data.trainingsTotal}`,color:trainingColor,screen:'training'},{label:'Upcoming bookings',val:data.upcomingBookings.length,color:'#0369a1',screen:'booking'},{label:data.pendingCert?'Cert pending approval':'Cert up to date',val:loading?'—':data.pendingCert?'⏳':'✅',color:data.pendingCert?'#c84b2f':'#2a6049',screen:'training'}]
              .map((s,i) => (
                <a key={i} href="#" onClick={e=>{e.preventDefault();onNavigate(s.screen)}} onTouchEnd={e=>{e.preventDefault();onNavigate(s.screen)}} style={{ display:'block', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'18px 20px', cursor:'pointer', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none' }} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{ fontSize:28, fontWeight:600, color:s.color, marginBottom:4 }}>{loading?'—':s.val}</div>
                  <div style={{ fontSize:13, color:'var(--text2)' }}>{s.label}</div>
                </a>
              ))
            }
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Quick access</div>
          {quickLinks.map(m => (
            <a key={m.key} href="#" onClick={e=>{e.preventDefault();m.external?setConfirmExternal({url:mileageUrl}):onNavigate(m.screen)}} onTouchEnd={e=>{e.preventDefault();m.external?setConfirmExternal({url:mileageUrl}):onNavigate(m.screen)}}
              style={{ display:'block', borderRadius:'var(--radius-lg)', overflow:'hidden', cursor:'pointer', height:56, position:'relative', border:'1px solid var(--border)', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none', backgroundColor:`${m.color}18`, backgroundImage:moduleImages[m.key]?`url(${moduleImages[m.key]})`:'none', backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=m.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              {moduleImages[m.key] && <div style={{ position:'absolute',inset:0,background:'linear-gradient(to right,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.2) 100%)',pointerEvents:'none' }} />}
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',gap:12,padding:'0 14px',pointerEvents:'none' }}>
                <span style={{ fontSize:18,flexShrink:0 }}>{m.icon}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:moduleImages[m.key]?'#fff':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.75)':'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.sub}</div>
                </div>
                {m.external&&<span style={{ fontSize:10,color:'var(--text3)',flexShrink:0 }}>↗</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
      {confirmExternal&&<ExternalLinkModal url={confirmExternal.url} onConfirm={()=>{window.open(confirmExternal.url,'_blank');setConfirmExternal(null)}} onCancel={()=>setConfirmExternal(null)} />}
    </>
  )
}

function DashboardView({ modules, onNavigate, mileageUrl, labSafetyUrl, moduleImages }) {
  const { session } = useAppStore()
  const [stats, setStats] = useState({ activeProjects:0, students:0, pendingTraining:0, lowSupplies:0 })
  const [recentInspections, setRecentInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmExternal, setConfirmExternal] = useState(null)
  useEffect(() => { loadStats() }, [])
  async function loadStats() {
    setLoading(true)
    try {
      const isSuperAdmin = !session?.userId
      const orgId = session?.organizationId
      let suppliesQ = sb.from('supplies').select('id,min_qty')
      let projectsQ = sb.from('projects').select('id,status').eq('status','active')
      let studentsQ = sb.from('users').select('id').eq('role','student').eq('is_active',true)
      let inspectionsQ = sb.from('inspections').select('id,room_name,inspected_at,flag_count,inspector').order('inspected_at',{ascending:false}).limit(5)
      let trainingQ = sb.from('training_fresh').select('id').eq('admin_approved',false)
      if (!isSuperAdmin && orgId) {
        suppliesQ = suppliesQ.eq('organization_id', orgId)
        projectsQ = projectsQ.eq('organization_id', orgId)
        studentsQ = studentsQ.eq('organization_id', orgId)
        inspectionsQ = inspectionsQ.eq('organization_id', orgId)
        // training_fresh has no organization_id — filter via org user IDs
        const { data: orgUsers } = await sb.from('users').select('id').eq('organization_id', orgId).eq('is_active', true)
        const orgUserIds = (orgUsers || []).map(u => u.id)
        trainingQ = orgUserIds.length ? trainingQ.in('user_id', orgUserIds) : Promise.resolve({ data: [] })
      }
      const [supplies,projects,students,inspections,training] = await Promise.all([
        suppliesQ, projectsQ, studentsQ, inspectionsQ, trainingQ,
      ])
      setStats({ lowSupplies:(supplies.data||[]).length, activeProjects:(projects.data||[]).length, students:(students.data||[]).length, pendingTraining:(training.data||[]).length })
      setRecentInspections(inspections.data||[])
    } catch(e) {}
    setLoading(false)
  }
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20, alignItems:'start' }}>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Active projects',       value:stats.activeProjects,  color:'#7c4dbd', screen:'projects' },
              { label:'Active lab users',        value:stats.students,        color:'#0369a1', screen:'training' },
              { label:'Pending cert approvals', value:stats.pendingTraining, color:'#c84b2f', screen:'training' },
              { label:'Supply items tracked',   value:stats.lowSupplies,     color:'#2a6049', screen:'home'     },
            ].map(s => (
              <a key={s.label} href="#" onClick={e=>{e.preventDefault();onNavigate(s.screen)}} onTouchEnd={e=>{e.preventDefault();onNavigate(s.screen)}} style={{ display:'block', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'18px 20px', cursor:'pointer', transition:'all 0.15s', touchAction:'manipulation', WebkitTapHighlightColor:'transparent', textDecoration:'none' }} onMouseEnter={e=>e.currentTarget.style.borderColor=s.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{ fontSize:28, fontWeight:600, color:s.color, marginBottom:4 }}>{loading?'—':s.value}</div>
                <div style={{ fontSize:13, color:'var(--text2)' }}>{s.label}</div>
              </a>
            ))}
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'18px 20px' }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>Recent inspections</div>
            {loading?<div style={{ textAlign:'center',padding:16 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
              :recentInspections.length===0?<div style={{ fontSize:13,color:'var(--text3)',textAlign:'center',padding:16 }}>No inspections yet.</div>
              :recentInspections.map(r=>(
                <div key={r.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--surface2)' }}>
                  <div><div style={{ fontSize:14,fontWeight:500 }}>{r.room_name}</div><div style={{ fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)' }}>{new Date(r.inspected_at).toLocaleDateString()} · {r.inspector}</div></div>
                  {r.flag_count>0?<span style={{ fontSize:12,color:'var(--accent2)',fontWeight:500 }}>{r.flag_count} low</span>:<span style={{ fontSize:12,color:'var(--accent)',fontWeight:500 }}>All OK</span>}
                </div>
              ))}
          </div>
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          <div style={{ fontSize:12,fontWeight:500,color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6 }}>Quick access</div>
          {modules.map(m=>(
            <a key={m.key} href="#" onClick={e=>{e.preventDefault();m.external?setConfirmExternal({url:m.key==='mileage'?mileageUrl:labSafetyUrl}):onNavigate(m.screen)}} onTouchEnd={e=>{e.preventDefault();m.external?setConfirmExternal({url:m.key==='mileage'?mileageUrl:labSafetyUrl}):onNavigate(m.screen)}}
              style={{ display:'block',borderRadius:'var(--radius-lg)',overflow:'hidden',cursor:'pointer',height:56,position:'relative',border:'1px solid var(--border)',transition:'all 0.15s',touchAction:'manipulation',WebkitTapHighlightColor:'transparent',textDecoration:'none',backgroundColor:m.bg,backgroundImage:moduleImages[m.key]?`url(${moduleImages[m.key]})`:'none',backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=m.color} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              {moduleImages[m.key] && <div style={{ position:'absolute',inset:0,background:'linear-gradient(to right,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.2) 100%)',pointerEvents:'none' }} />}
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',gap:12,padding:'0 14px',pointerEvents:'none' }}>
                {!moduleImages[m.key]&&<span style={{ fontSize:18,flexShrink:0 }}>{m.icon}</span>}
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:moduleImages[m.key]?'#fff':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.75)':'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{m.sub}</div>
                </div>
                {m.external&&<span style={{ fontSize:10,color:moduleImages[m.key]?'rgba(255,255,255,0.7)':'var(--text3)',flexShrink:0 }}>↗</span>}
              </div>
            </a>
          ))}
        </div>
      </div>
      {confirmExternal&&<ExternalLinkModal url={confirmExternal.url} onConfirm={()=>{window.open(confirmExternal.url,'_blank');setConfirmExternal(null)}} onCancel={()=>setConfirmExternal(null)} />}
    </>
  )
}

export default function Dashboard() {
  const { session, setScreen, activeModules, setActiveModules, setPendingAdminTab } = useAppStore()
  const [view, setView] = useState(() => localStorage.getItem('labstock_view') || 'grid')
  const [mileageUrl, setMileageUrl] = useState('https://bw4qh7p8sn.us-east-1.awsapprunner.com/')
  const [labSafetyUrl, setLabSafetyUrl] = useState('https://canvas.illinois.edu/')
  const [editingUrl, setEditingUrl] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [userAccess, setUserAccess] = useState(null)
  const [studentAllowedPool, setStudentAllowedPool] = useState(null)
  const [moduleImages, setModuleImages] = useState({})
  const [orgName, setOrgName] = useState('')

  const isAdmin   = session?.role === 'admin'
  const isStudent = session?.role === 'student'
  const isSolo    = session?.loginMode === 'solo'
  const loginMode = session?.loginMode || 'team'

  useEffect(() => {
    if (session?.userId && (session?.role === 'user' || session?.role === 'admin' || session?.role === 'student')) {
      sb.from('user_screen_access').select('screen_key').eq('user_id', session.userId)
        .then(({ data }) => { if (data?.length) setUserAccess(new Set(data.map(r => r.screen_key))) })
    }
  }, [session?.userId])

  useEffect(() => { loadDashboardPrefs() }, [session?.userId, session?.loginMode])

  async function loadDashboardPrefs() {
    try {
      if (!session?.loginMode) return
      if (!session?.userId) {
        const saved = localStorage.getItem('ilab_admin_modules')
        setActiveModules(saved ? JSON.parse(saved) : null)
        return
      }
      if (isSolo) {
        const [soloRes, settingsRes] = await Promise.all([
          sb.from('solo_users').select('active_modules').eq('id', session.userId).maybeSingle(),
          sb.from('settings').select('value').eq('key', 'solo_allowed_modules').maybeSingle(),
        ])
        let mods = soloRes.data?.active_modules
        try {
          const soloPool = settingsRes?.data?.value ? JSON.parse(settingsRes.data.value) : null
          if (soloPool !== null) {
            if (mods?.length) {
              const filtered = mods.filter(k => soloPool.includes(k) || k === 'profile')
              const missing = soloPool.filter(k => !filtered.includes(k) && k !== 'profile')
              mods = [...filtered, ...missing]
            } else {
              mods = soloPool
            }
          }
        } catch {}
        setActiveModules(mods?.length ? mods : null)
      } else {
        const [prefsRes, orgRes, appRes] = await Promise.all([
          sb.from('user_dashboard_prefs').select('active_modules, allowed_modules').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(1),
          session?.organizationId
            ? sb.from('organizations').select('allowed_modules').eq('id', session.organizationId).maybeSingle()
            : Promise.resolve(null),
          sb.from('settings').select('value').eq('key', 'app_allowed_modules').maybeSingle(),
        ])
        const row = prefsRes.data?.[0]
        let mods = row?.active_modules
        try {
          let appPool = null
          try { appPool = appRes?.data?.value ? JSON.parse(appRes.data.value) : null } catch {}
          const orgPool = orgRes?.data?.allowed_modules || null
          // Org pool overrides global pool; global is the default when no org pool is set
          const effectivePool = orgPool ?? appPool
          if (effectivePool !== null) {
            if (mods?.length) {
              // Keep saved order, remove no-longer-allowed modules, append newly-allowed ones
              const filtered = mods.filter(k => effectivePool.includes(k) || k === 'profile')
              const missing = effectivePool.filter(k => !filtered.includes(k) && k !== 'profile')
              mods = [...filtered, ...missing]
            } else {
              // No saved prefs — pool defines what's visible
              mods = effectivePool
            }
          }
        } catch {}
        setActiveModules(mods?.length ? mods : null)
        if (session?.role === 'student') {
          setStudentAllowedPool(new Set(row?.allowed_modules || []))
        }
      }
    } catch(e) {}
  }

  const allModules = (() => {
    const base = getModules(session?.role, loginMode, activeModules)
    // For staff: auto-include adminOnly modules that admin has explicitly granted via user_screen_access
    if (session?.role === 'user' && userAccess) {
      const baseKeys = new Set(base.map(m => m.key))
      ALL_MODULES_META.forEach(m => {
        if (m.adminOnly && m.screen && userAccess.has(m.screen) && !baseKeys.has(m.key)) base.push(m)
      })
    }
    return base
  })()
  // Screens not managed by user_screen_access (always allowed if in activeModules)
  const UNMANAGED_SCREENS = new Set(['profile', 'dashboard', 'pm', 'barcode', 'barcodeqr', 'orgadmin', 'home', 'equipment'])
  const modules = userAccess
    ? allModules.filter(m => m.external || !m.screen || UNMANAGED_SCREENS.has(m.screen) || userAccess.has(m.screen))
    : allModules

  useEffect(() => { loadSettings() }, [session?.userId])
  async function loadSettings() {
    const base = import.meta.env.BASE_URL
    const imgs = {
      pm:        `${base}icon-pm.svg`,
      barcode:   `${base}icon-barcode.svg`,
      barcodeqr: `${base}icon-barcodeqr.svg`,
      profile:   `${base}icon-profile.svg`,
      supply:    `${base}icon-supply.svg`,
    }

    const imgPrefix = isSolo ? 'solo_img_' : 'img_'

    // Load URL settings + global icon images in parallel
    const [{ data: settingsData }, { data: globalImgData }] = await Promise.all([
      sb.from('settings').select('key, value').in('key', ['mileage_url', 'labsafety_url']),
      sb.from('settings').select('key, value').like('key', `${imgPrefix}%`),
    ])
    ;(settingsData || []).forEach(r => {
      if (r.key === 'mileage_url') setMileageUrl(r.value)
      else if (r.key === 'labsafety_url') setLabSafetyUrl(r.value)
    })
    // Apply global images uploaded by super admin
    ;(globalImgData || []).forEach(r => {
      const moduleKey = r.key.replace(imgPrefix, '')
      if (r.value) imgs[moduleKey] = r.value
    })

    // Override with per-org images and fetch org name for team users
    if (session?.organizationId && !isSolo) {
      const { data: orgData } = await sb.from('organizations').select('name, module_images').eq('id', session.organizationId).maybeSingle()
      if (orgData?.name) setOrgName(orgData.name)
      Object.assign(imgs, orgData?.module_images || {})
    }

    setModuleImages(imgs)
  }

  async function saveUrl() {
    if (!urlInput.trim()) return
    setSavingUrl(true)
    const key = editingUrl === 'mileage' ? 'mileage_url' : 'labsafety_url'
    await sb.from('settings').upsert({ key, value: urlInput.trim() })
    if (editingUrl === 'mileage') setMileageUrl(urlInput.trim())
    else setLabSafetyUrl(urlInput.trim())
    setEditingUrl(null); setSavingUrl(false)
  }

  function switchView(v) { setView(v); localStorage.setItem('labstock_view', v) }

  const greeting = () => { const h = new Date().getHours(); if (h<12) return 'Good morning'; if (h<17) return 'Good afternoon'; return 'Good evening' }
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const now = new Date()
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`

  const isSuperAdmin = isAdmin && !session?.userId

  // Super admin: greeting + shortcut to admin panel
  if (isSuperAdmin) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', marginBottom: 4 }}>{greeting()}, {session?.username}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{dateStr} · iLab Super Admin</div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div
            onClick={() => setScreen('orgadmin')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: '14px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 15, boxShadow: '0 2px 10px rgba(0,0,0,0.12)', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <span style={{ fontSize: 20 }}>⚙️</span> Admin Panel
          </div>
          <div
            onClick={() => setScreen('profile')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 15, transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <span style={{ fontSize: 20 }}>🔐</span> Profile
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.4px', marginBottom:4 }}>{greeting()}, {session?.username}</div>
          <div style={{ fontSize:13, color:'var(--text3)', fontFamily:'var(--mono)' }}>{dateStr}{orgName ? ` · iLab for ${orgName}` : ''}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {!isStudent && (
            <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--radius)', padding:3, gap:2 }}>
              <button onClick={() => switchView('grid')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='grid'?'var(--surface)':'transparent', color:view==='grid'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>⊞ Cards</button>
              <button onClick={() => switchView('dashboard')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='dashboard'?'var(--surface)':'transparent', color:view==='dashboard'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>☰ Dashboard</button>
            </div>
          )}
          {isStudent && (
            <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'var(--radius)', padding:3, gap:2 }}>
              <button onClick={() => switchView('grid')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='grid'?'var(--surface)':'transparent', color:view==='grid'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>⊞ Cards</button>
              <button onClick={() => switchView('dashboard')} style={{ padding:'6px 14px', border:'none', borderRadius:8, fontFamily:'var(--sans)', fontSize:13, fontWeight:500, cursor:'pointer', background:view==='dashboard'?'var(--surface)':'transparent', color:view==='dashboard'?'var(--text)':'var(--text2)', transition:'all 0.15s' }}>📋 My Activity</button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div
          onClick={() => setScreen('orgadmin')}
          style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 20px', marginBottom:20, cursor:'pointer', transition:'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#1D9E75'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(29,158,117,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
          <div style={{ fontSize:28 }}>⚙️</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>Admin Panel</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Manage users, access control & organization settings</div>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)' }}>→</div>
        </div>
      )}

      {isStudent && view==='dashboard' && <StudentDashboardView session={session} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} moduleImages={moduleImages} activeModules={activeModules} />}
      {isStudent && view==='grid'      && <CardGridView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} isAdmin={false} onEditUrl={()=>{}} moduleImages={moduleImages} isStudent={true} activeModules={activeModules} studentAccess={userAccess} studentAllowedPool={studentAllowedPool} />}
      {!isStudent && view==='grid'     && <CardGridView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} isAdmin={isAdmin} onEditUrl={(type)=>{setEditingUrl(type);setUrlInput(type==='mileage'?mileageUrl:labSafetyUrl)}} moduleImages={moduleImages} isStudent={false} activeModules={activeModules} />}
      {!isStudent && view==='dashboard' && <DashboardView modules={modules} onNavigate={s=>setScreen(s)} mileageUrl={mileageUrl} labSafetyUrl={labSafetyUrl} moduleImages={moduleImages} />}

      {editingUrl !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', padding:28, maxWidth:480, width:'100%', border:'1px solid var(--border)' }}>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>{editingUrl==='mileage'?'🚗 Mileage Form URL':'🦺 Lab Safety URL'}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Update the external link for the {editingUrl==='mileage'?'Mileage Form':'Lab Safety'} icon.</div>
            <div className="field"><label>Website URL</label><input type="url" value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://..." onKeyDown={e=>e.key==='Enter'&&saveUrl()} /></div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn btn-primary" onClick={saveUrl} disabled={savingUrl||!urlInput.trim()}>{savingUrl?'Saving…':'Save URL'}</button>
              <button className="btn" onClick={()=>setEditingUrl(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
