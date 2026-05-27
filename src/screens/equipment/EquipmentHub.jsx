import HelpPanel from '../../components/HelpPanel'
import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../store/useAppStore'
import ScrollTabs from '../../components/ScrollTabs'

function canEdit(s) { return s?.role === 'admin' || s?.role === 'user' }

async function uploadFile(file, path) {
  const { error } = await sb.storage.from('project-files').upload(path, file, { upsert: true })
  if (error) throw error
  return sb.storage.from('project-files').getPublicUrl(path).data.publicUrl
}

async function compressImage(file, maxPx = 800) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.85)
    }
    img.src = url
  })
}

function EquipmentInfo({ equipment, session }) {
  const { toast } = useAppStore()
  const [details, setDetails] = useState(null)
  const [videos, setVideos] = useState([])
  const [sop, setSop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState(null)
  const [editDetails, setEditDetails] = useState(false)
  const [detailsForm, setDetailsForm] = useState({ photo_url: '', website_url: '', notes: '' })
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [videoForm, setVideoForm] = useState({ title: '', video_url: '', description: '' })
  const [showSopForm, setShowSopForm] = useState(false)
  const [sopForm, setSopForm] = useState({ title: '', pdf_url: '', steps: [] })
  const [newStep, setNewStep] = useState('')
  const [uploading, setUploading] = useState(false)
  const [sopStep, setSopStep] = useState(null)
  const [confirmVideoUrl, setConfirmVideoUrl] = useState(null)
  const photoRef = useRef(null)
  const sopPdfRef = useRef(null)

  useEffect(() => { load() }, [equipment.id])

  async function load() {
    setLoading(true)
    const isStudent = session?.role === 'student'
    if (isStudent) {
      const { data: trainRecs } = await sb.from('training_equipment').select('passed_exam').eq('user_id', session.userId).eq('equipment_id', equipment.id)
      const hasPassed = trainRecs?.some(r => r.passed_exam)
      if (!hasPassed) {
        const { data: tempRec } = await sb.from('equipment_temp_access').select('*').eq('user_id', session.userId).eq('equipment_id', equipment.id).maybeSingle()
        const tempValid = tempRec && new Date(tempRec.expires_at) > new Date()
        setAccess(tempValid)
        if (!tempValid) { setLoading(false); return }
      } else { setAccess(true) }
    } else { setAccess(true) }

    const [{ data: det }, { data: vid }, { data: s }] = await Promise.all([
      sb.from('equipment_details').select('*').eq('equipment_id', equipment.id).maybeSingle(),
      sb.from('equipment_videos').select('*').eq('equipment_id', equipment.id).order('created_at'),
      sb.from('equipment_sop').select('*').eq('equipment_id', equipment.id).maybeSingle(),
    ])
    setDetails(det || null); setVideos(vid || []); setSop(s || null)
    if (det) setDetailsForm({ photo_url: det.photo_url || '', website_url: det.website_url || '', notes: det.notes || '' })
    if (s) setSopForm({ title: s.title || '', pdf_url: s.pdf_url || '', steps: s.steps || [] })
    setLoading(false)
  }

  async function saveDetails() {
    const payload = { equipment_id: equipment.id, ...detailsForm, updated_at: new Date().toISOString() }
    if (details) await sb.from('equipment_details').update(payload).eq('id', details.id)
    else await sb.from('equipment_details').insert(payload)
    toast('Details saved ✓'); setEditDetails(false); load()
  }

  async function uploadPhoto(file) {
    if (!file?.type.startsWith('image/')) { toast('Please select an image.'); return }
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const url = await uploadFile(blob, `equipment/${equipment.id}/photo_${Date.now()}.jpg`)
      setDetailsForm(f => ({ ...f, photo_url: url })); toast('Photo uploaded ✓')
    } catch { toast('Upload failed.') }
    setUploading(false)
  }

  async function saveVideo() {
    if (!videoForm.title.trim()) { toast('Title required.'); return }
    await sb.from('equipment_videos').insert({ equipment_id: equipment.id, ...videoForm })
    toast('Video added ✓'); setShowVideoForm(false); setVideoForm({ title: '', video_url: '', description: '' }); load()
  }

  async function deleteVideo(id) {
    if (!confirm('Remove this video?')) return
    await sb.from('equipment_videos').delete().eq('id', id)
    load(); toast('Video removed.')
  }

  async function uploadSopPdf(file) {
    if (file?.type !== 'application/pdf') { toast('Please select a PDF.'); return }
    setUploading(true)
    try {
      const url = await uploadFile(file, `equipment/${equipment.id}/sop_${Date.now()}.pdf`)
      setSopForm(f => ({ ...f, pdf_url: url })); toast('PDF uploaded ✓')
    } catch { toast('Upload failed.') }
    setUploading(false)
  }

  async function saveSop() {
    const payload = { equipment_id: equipment.id, ...sopForm, updated_at: new Date().toISOString() }
    if (sop) await sb.from('equipment_sop').update(payload).eq('id', sop.id)
    else await sb.from('equipment_sop').insert(payload)
    toast('SOP saved ✓'); setShowSopForm(false); load()
  }

  function addStep() {
    if (!newStep.trim()) return
    setSopForm(f => ({ ...f, steps: [...f.steps, { text: newStep.trim(), order: f.steps.length + 1 }] })); setNewStep('')
  }
  function removeStep(i) { setSopForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) })) }
  function moveStep(i, dir) {
    setSopForm(f => {
      const steps = [...f.steps]; const j = i + dir
      if (j < 0 || j >= steps.length) return f
      ;[steps[i], steps[j]] = [steps[j], steps[i]]; return { ...f, steps }
    })
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  const restrictedContent = access === false
  const steps = sop?.steps || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Photo + basic info */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Equipment Info</div>
          {canEdit(session) && !editDetails && <button className="btn btn-sm" onClick={() => setEditDetails(true)}>✏️ Edit</button>}
        </div>
        {editDetails ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Equipment Photo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {detailsForm.photo_url && <img src={detailsForm.photo_url} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
                <div>
                  <button className="btn btn-sm" onClick={() => photoRef.current?.click()} disabled={uploading}>{uploading ? '⏳' : '⬆️ Upload photo'}</button>
                  <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
                  {detailsForm.photo_url && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setDetailsForm(f => ({ ...f, photo_url: '' }))}>Remove</button>}
                </div>
              </div>
            </div>
            <div className="field"><label>Equipment website URL</label><input value={detailsForm.website_url} onChange={e => setDetailsForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://…" /></div>
            <div className="field"><label>Notes</label><textarea rows={3} value={detailsForm.notes} onChange={e => setDetailsForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveDetails}>Save</button>
              <button className="btn" onClick={() => setEditDetails(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {details?.photo_url
              ? <img src={details.photo_url} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }} />
              : <div style={{ width: 140, height: 140, borderRadius: 10, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--text3)', flexShrink: 0 }}>📷</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{equipment.equipment_name}</div>
              {equipment.nickname && <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>{equipment.nickname}</div>}
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 4 }}>📍 {equipment.location || '—'} · {equipment.category || '—'}</div>
              {details?.website_url && <a href={details.website_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', display: 'block', marginBottom: 4 }}>🌐 Manufacturer website</a>}
              {details?.notes && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>{details.notes}</div>}
              {!details && canEdit(session) && <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No info added yet. Click Edit to add photo and details.</div>}
            </div>
          </div>
        )}
      </div>

      {/* Training Videos */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>🎦 Training Videos</div>
          {canEdit(session) && <button className="btn btn-sm btn-primary" onClick={() => setShowVideoForm(true)}>+ Add video</button>}
        </div>
        {restrictedContent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--text3)', fontSize: 13 }}>
            <span style={{ fontSize: 20 }}>🔒</span> Available after completing equipment training or with temporary access from ICT-RE.
          </div>
        ) : (
          <div>
            {showVideoForm && (
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14 }}>
                <div className="field"><label>Title *</label><input value={videoForm.title} onChange={e => setVideoForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. How to operate the Gyratory Compactor" autoFocus /></div>
                <div className="field"><label>Video URL or external link</label><input value={videoForm.video_url} onChange={e => setVideoForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://youtube.com/watch?v=… or any URL" /></div>
                <div className="field"><label>Description</label><textarea rows={2} value={videoForm.description} onChange={e => setVideoForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveVideo}>Save</button>
                  <button className="btn btn-sm" onClick={() => setShowVideoForm(false)}>Cancel</button>
                </div>
              </div>
            )}
            {videos.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No training videos yet.</div>
              : videos.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--surface2)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>▶️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title}</div>
                    {v.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{v.description}</div>}
                    {v.video_url && (
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 6, fontSize: 12 }}
                        onClick={() => setConfirmVideoUrl(v.video_url)}>▶ Watch video / Open link</button>
                    )}
                  </div>
                  {canEdit(session) && <button className="btn btn-sm btn-danger" style={{ padding: '3px 8px' }} onClick={() => deleteVideo(v.id)}>✕</button>}
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* SOP */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>📋 Standard Operating Procedure (SOP)</div>
          {canEdit(session) && <button className="btn btn-sm btn-primary" onClick={() => { setSopForm(sop ? { title: sop.title||'', pdf_url: sop.pdf_url||'', steps: sop.steps||[] } : { title: '', pdf_url: '', steps: [] }); setShowSopForm(true) }}>{sop ? '✏️ Edit SOP' : '+ Add SOP'}</button>}
        </div>
        {restrictedContent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--text3)', fontSize: 13 }}>
            <span style={{ fontSize: 20 }}>🔒</span> Available after completing equipment training or with temporary access from ICT-RE.
          </div>
        ) : (
          <div>
            {showSopForm && (
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14 }}>
                <div className="field"><label>SOP Title</label><input value={sopForm.title} onChange={e => setSopForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Gyratory Compactor Operation Procedure" /></div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>SOP PDF Document</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {sopForm.pdf_url && <a href={sopForm.pdf_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent)' }}>📄 Current PDF</a>}
                    <button className="btn btn-sm" onClick={() => sopPdfRef.current?.click()} disabled={uploading}>{uploading ? '⏳' : '⬆️ Upload PDF'}</button>
                    <input ref={sopPdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => uploadSopPdf(e.target.files[0])} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Step-by-step procedure</div>
                {sopForm.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 13, padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>{step.text}</div>
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: '0 4px' }}>↑</button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === sopForm.steps.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: '0 4px' }}>↓</button>
                    <button onClick={() => removeStep(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent2)', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={newStep} onChange={e => setNewStep(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStep()} placeholder="Type a step and press Enter or Add" style={{ flex: 1 }} />
                  <button className="btn btn-sm" onClick={addStep}>Add step</button>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveSop}>Save SOP</button>
                  <button className="btn btn-sm" onClick={() => setShowSopForm(false)}>Cancel</button>
                </div>
              </div>
            )}
            {!sop ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No SOP added yet.</div>
            ) : (
              <div>
                {sop.title && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{sop.title}</div>}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  {sop.pdf_url && <a href={sop.pdf_url} target="_blank" rel="noopener" className="btn btn-sm"
                    onClick={async () => { if (session?.userId) await sb.from('equipment_material_progress').upsert({ user_id: session.userId, equipment_id: equipment.id, downloaded_sop: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id,equipment_id' }) }}>📄 Download SOP PDF</a>}
                  {steps.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => setSopStep(0)}>📖 View step-by-step ({steps.length} steps)</button>}
                </div>
                {sopStep !== null && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 32, maxWidth: 500, width: '100%', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Step {sopStep + 1} of {steps.length}</div>
                        <button className="btn btn-sm" onClick={() => setSopStep(null)}>✕ Close</button>
                      </div>
                      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 99, marginBottom: 28, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 99, width: `${((sopStep + 1) / steps.length) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, margin: '0 auto 20px' }}>{sopStep + 1}</div>
                      <div style={{ fontSize: 17, fontWeight: 500, textAlign: 'center', lineHeight: 1.6, marginBottom: 32 }}>{steps[sopStep]?.text}</div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <button className="btn" onClick={() => setSopStep(s => Math.max(0, s - 1))} disabled={sopStep === 0}>← Previous</button>
                        {sopStep < steps.length - 1 ? <button className="btn btn-primary" onClick={() => setSopStep(s => s + 1)}>Next →</button> : <button className="btn btn-primary" onClick={() => setSopStep(null)}>✓ Done</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video external link modal */}
      {confirmVideoUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>▶️</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>Opening external link</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textAlign: 'center' }}>You are being redirected to:</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all', textAlign: 'center' }}>{confirmVideoUrl}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmVideoUrl(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                if (session?.userId) await sb.from('equipment_material_progress').upsert({ user_id: session.userId, equipment_id: equipment.id, watched_video: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id,equipment_id' })
                window.open(confirmVideoUrl, '_blank'); setConfirmVideoUrl(null)
              }}>Continue →</button>
            </div>
          </div>
        </div>
      )}

      {/* SOP Notes */}
      {!restrictedContent && <SOPNotes equipment={equipment} session={session} />}

      {/* Exam CTA */}
      {!restrictedContent && !canEdit(session) && (
        <div className="card" style={{ textAlign: 'center', padding: 32, background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--surface) 100%)', border: '2px solid var(--accent)' }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>📝</div>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Ready to take the exam?</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>Once you have watched the training videos and reviewed the SOP,<br />start the exam for <strong>{equipment.nickname || equipment.equipment_name}</strong>.</div>
          <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 32px' }} onClick={() => { localStorage.setItem('examEquipment', equipment.id); useAppStore.getState().setScreen('training') }}>Start Exam →</button>
        </div>
      )}
    </div>
  )
}

function SOPNotes({ equipment, session }) {
  const { toast } = useAppStore()
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { load() }, [equipment.id])
  async function load() {
    setLoading(true)
    const { data } = await sb.from('equipment_sop_notes').select('*').eq('equipment_id', equipment.id).order('created_at', { ascending: false })
    setNotes(data || []); setLoading(false)
  }
  async function submitNote() {
    if (!newNote.trim()) return
    setSaving(true)
    await sb.from('equipment_sop_notes').insert({ equipment_id: equipment.id, user_id: session.userId, user_name: session.username, note: newNote.trim() })
    setNewNote(''); toast('Note submitted.'); setSaving(false); load()
  }
  async function deleteNote(id) {
    if (!confirm('Delete this note?')) return
    await sb.from('equipment_sop_notes').delete().eq('id', id); load(); toast('Note deleted.')
  }
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>💬 SOP Notes & Feedback</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Leave comments about SOP changes, step clarifications, or suggestions for improvement.</div>
      <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="e.g. Step 3 needs clarification…" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
      <button className="btn btn-sm btn-primary" onClick={submitNote} disabled={saving || !newNote.trim()} style={{ marginBottom: 20 }}>{saving ? 'Submitting…' : 'Submit note'}</button>
      {loading ? <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : notes.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No notes yet.</div>
        : notes.map(n => (
          <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--surface2)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{(n.user_name || 'U')[0].toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{n.user_name || 'Unknown'}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{n.note}</div>
            </div>
            {(canEdit(session) || session?.userId === n.user_id) && <button onClick={() => deleteNote(n.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent2)', fontSize: 14, padding: '0 4px', flexShrink: 0 }}>✕</button>}
          </div>
        ))}
    </div>
  )
}

function TemporaryAccessPanel({ equipment, session }) {
  const { toast } = useAppStore()
  const [students, setStudents] = useState([])
  const [tempAccesses, setTempAccesses] = useState([])
  const [trainedIds, setTrainedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [granting, setGranting] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  useEffect(() => { load() }, [equipment.id])
  async function load() {
    setLoading(true)
    const [{ data: studs }, { data: temps }, { data: trained }] = await Promise.all([
      sb.from('users').select('id, name, project_group').eq('role', 'student').eq('is_active', true).order('name'),
      sb.from('equipment_temp_access').select('*').eq('equipment_id', equipment.id),
      sb.from('training_equipment').select('user_id').eq('equipment_id', equipment.id).eq('passed_exam', true),
    ])
    setStudents(studs || []); setTempAccesses(temps || []); setTrainedIds((trained || []).map(t => t.user_id)); setLoading(false)
  }
  async function grantAccess() {
    if (!selectedUser) { toast('Select a student.'); return }
    setGranting(true)
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await sb.from('equipment_temp_access').upsert({ user_id: selectedUser, equipment_id: equipment.id, granted_by: session.username, granted_at: new Date().toISOString(), expires_at: expires }, { onConflict: 'user_id,equipment_id' })
    toast('1-week access granted ✓'); setSelectedUser(''); setGranting(false); load()
  }
  async function revokeAccess(userId) {
    await sb.from('equipment_temp_access').delete().eq('user_id', userId).eq('equipment_id', equipment.id)
    toast('Access revoked.'); load()
  }
  const untrainedStudents = students.filter(s => !trainedIds.includes(s.id))
  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔑 Temporary Access Management</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Grant untrained students 1-week access to view SOP and training materials before their training session.</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">— Select student —</option>
          {untrainedStudents.map(s => <option key={s.id} value={s.id}>{s.name}{s.project_group ? ` (${s.project_group})` : ''}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" onClick={grantAccess} disabled={granting || !selectedUser}>{granting ? 'Granting…' : 'Grant 1-week access'}</button>
      </div>
      {loading ? null : tempAccesses.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>No temporary access currently granted.</div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Active temporary access</div>
          {tempAccesses.map(ta => {
            const student = students.find(s => s.id === ta.user_id)
            const expired = new Date(ta.expires_at) < new Date()
            const daysLeft = Math.ceil((new Date(ta.expires_at) - new Date()) / 86400000)
            return (
              <div key={ta.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--surface2)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{student?.name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: expired ? 'var(--accent2)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{expired ? 'EXPIRED' : `${daysLeft}d left`} · Granted by {ta.granted_by} · Expires {new Date(ta.expires_at).toLocaleDateString()}</div>
                </div>
                <button className="btn btn-sm btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => revokeAccess(ta.user_id)}>Revoke</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STD_TYPES = ['AASHTO', 'IDOT', 'ASTM', 'Other']

function StandardsTab({ equipment, session }) {
  const { toast } = useAppStore()
  const [standards, setStandards] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('AASHTO')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ standard_type: 'AASHTO', standard_number: '', standard_name: '', file_url: '', link_url: '' })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  useEffect(() => { load() }, [equipment.id])
  async function load() {
    setLoading(true)
    const { data } = await sb.from('equipment_standards').select('*').eq('equipment_id', equipment.id).order('standard_type').order('standard_number')
    setStandards(data || []); setLoading(false)
  }
  async function uploadStdFile(file) {
    setUploading(true)
    try {
      const url = await uploadFile(file, `equipment/${equipment.id}/std_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
      setForm(f => ({ ...f, file_url: url })); toast('File uploaded ✓')
    } catch { toast('Upload failed.') }
    setUploading(false)
  }
  async function saveStandard() {
    if (!form.standard_number.trim()) { toast('Standard number required.'); return }
    await sb.from('equipment_standards').insert({ equipment_id: equipment.id, ...form })
    toast('Standard added ✓'); setShowForm(false); setForm({ standard_type: activeType, standard_number: '', standard_name: '', file_url: '', link_url: '' }); load()
  }
  async function deleteStandard(id) {
    if (!confirm('Remove this standard?')) return
    await sb.from('equipment_standards').delete().eq('id', id); load(); toast('Standard removed.')
  }
  const filtered = standards.filter(s => s.standard_type === activeType)
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {STD_TYPES.map(t => (
          <button key={t} onClick={() => { setActiveType(t); setShowForm(false) }}
            style={{ padding: '8px 18px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: activeType === t ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${activeType === t ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s' }}>
            {t}{standards.filter(s => s.standard_type === t).length > 0 && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 99, padding: '1px 7px' }}>{standards.filter(s => s.standard_type === t).length}</span>}
          </button>
        ))}
      </div>
      {canEdit(session) && <div style={{ marginBottom: 16 }}><button className="btn btn-sm btn-primary" onClick={() => { setForm(f => ({ ...f, standard_type: activeType })); setShowForm(true) }}>+ Add {activeType} standard</button></div>}
      {showForm && (
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field"><label>Standard Number *</label><input value={form.standard_number} onChange={e => setForm(f => ({ ...f, standard_number: e.target.value }))} placeholder={`e.g. ${activeType === 'AASHTO' ? 'T 27' : activeType === 'ASTM' ? 'C 136' : activeType === 'IDOT' ? 'IDOT-101' : 'ISO 9001'}`} autoFocus /></div>
            <div className="field"><label>Standard Name / Title</label><input value={form.standard_name} onChange={e => setForm(f => ({ ...f, standard_name: e.target.value }))} placeholder="e.g. Sieve Analysis of Fine and Coarse Aggregates" /></div>
          </div>
          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Upload file (PDF)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '⏳' : '⬆️ Upload'}</button>
                {form.file_url && <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓ File uploaded</span>}
                <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => uploadStdFile(e.target.files[0])} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Or enter URL</label><input value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://…" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary btn-sm" onClick={saveStandard}>Save</button>
            <button className="btn btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        : filtered.length === 0 ? <div className="empty-state" style={{ padding: 24 }}><div className="empty-icon">📑</div>No {activeType} standards added yet.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Standard #</th><th>Name / Title</th><th>File / Link</th>{canEdit(session) && <th></th>}</tr></thead>
              <tbody>
                {filtered.map(std => (
                  <tr key={std.id}>
                    <td>{std.file_url || std.link_url ? <a href={std.file_url || std.link_url} target="_blank" rel="noopener" style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--mono)', fontSize: 14 }}>{std.standard_number}</a> : <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 14 }}>{std.standard_number}</span>}</td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{std.standard_name || '—'}</td>
                    <td><div style={{ display: 'flex', gap: 8 }}>{std.file_url && <a href={std.file_url} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>📄 Download</a>}{std.link_url && <a href={std.link_url} target="_blank" rel="noopener" className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>🔗 Link</a>}{!std.file_url && !std.link_url && <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>}</div></td>
                    {canEdit(session) && <td><button className="btn btn-sm btn-danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => deleteStandard(std.id)}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

export default function EquipmentHub() {
  const { session } = useAppStore()
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [subTab, setSubTab] = useState('info')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const isSolo = session?.loginMode === 'solo'
    let q = sb.from('equipment_inventory').select('*').eq('is_active', true).eq('login_mode', isSolo ? 'solo' : 'team').order('category').order('equipment_name')
    if (!isSolo) q = q.eq('organization_id', session?.organizationId || '00000000-0000-0000-0000-000000000000')
    const { data } = await q
    setEquipment(data || [])
    setLoading(false)
    const autoSelect = localStorage.getItem('selectEquipment')
    if (autoSelect) { localStorage.removeItem('selectEquipment'); setSelected(data?.find(e => e.id === autoSelect) || null); setSubTab('info') }
  }

  const categories = [...new Set(equipment.map(e => e.category).filter(Boolean))]
  const filtered = equipment.filter(e => {
    const q = search.toLowerCase()
    return (!q || [e.equipment_name, e.nickname, e.category, e.location].some(f => f?.toLowerCase().includes(q))) && (!filterCat || e.category === filterCat)
  })

  return (
    <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: 20, alignItems: 'flex-start', minHeight: 500 }}>
      <div style={{ width: mobile ? '100%' : 260, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…" style={{ width: '100%', marginBottom: 8 }} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: mobile ? 220 : 600 }}>
          {loading ? <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            : filtered.length === 0 ? (
              equipment.length === 0
                ? <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>🔧</div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>No equipment available yet.</div>
                    <div style={{ fontSize: 12 }}>Equipment will appear here once items are added under the <strong>Equipment Inventory</strong> icon by your administrator.</div>
                  </div>
                : <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No equipment found.</div>
            )
            : filtered.map((e, idx) => (
              <div key={e.id} onClick={() => { setSelected(e); setSubTab('info') }}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--surface2)', background: selected?.id === e.id ? 'var(--accent-light)' : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={ev => { if (selected?.id !== e.id) ev.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={ev => { if (selected?.id !== e.id) ev.currentTarget.style.background = 'transparent' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2, flexShrink: 0 }}>#{idx+1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: selected?.id === e.id ? 600 : 500, fontSize: 13, color: selected?.id === e.id ? 'var(--accent)' : 'var(--text)' }}>{e.nickname || e.equipment_name}</div>
                    {e.nickname && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{e.equipment_name}</div>}
                    {e.location && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.location}</div>}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div className="empty-state" style={{ marginTop: 60 }}><div className="empty-icon">🔧</div><div>Select equipment from the list to view details</div></div>
        ) : (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{selected.nickname || selected.equipment_name}</div>
              {selected.nickname && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{selected.equipment_name}</div>}
            </div>
            <ScrollTabs style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {[
                { key: 'info', label: '📋 Equipment Info' },
                { key: 'standards', label: '📑 Standards' },
                ...(canEdit(session) ? [{ key: 'access', label: '🔑 Temp Access' }] : [])
              ].map(t => (
                <button key={t.key} onClick={() => setSubTab(t.key)}
                  style={{ padding: '10px 20px', border: 'none', background: 'transparent', fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: subTab === t.key ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${subTab === t.key ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                  {t.label}
                </button>
              ))}
            </ScrollTabs>
            {subTab === 'info' && <EquipmentInfo equipment={selected} session={session} />}
            {subTab === 'standards' && <StandardsTab equipment={selected} session={session} />}
            {subTab === 'access' && canEdit(session) && <TemporaryAccessPanel equipment={selected} session={session} />}
          </div>
        )}
      </div>
    </div>
  )
}
