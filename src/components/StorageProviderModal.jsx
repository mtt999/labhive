import { useState, useEffect } from 'react'
import { providers } from '../lib/storage/StorageService'
import { useAppStore } from '../store/useAppStore'
import { isSupported as localFolderSupported } from '../lib/storage/LocalFolderProvider'

const OPTIONS = [
  {
    key: 'supabase',
    icon: '☁️',
    label: 'iLab Cloud',
    sub: 'Default. Your files are uploaded to iLab\'s secure servers. Works on any device, any browser, anywhere.',
    color: '#1D9E75',
    bg: '#e8f2ee',
    personal: false,
  },
  {
    key: 'localfolder',
    icon: '🗂️',
    label: 'Local Folder',
    sub: 'You pick a folder on your computer. Files are saved directly there — nothing is uploaded to any server. Works on Chrome and Edge.',
    color: '#7c4dbd',
    bg: '#f3eeff',
    personal: true,
    localfolder: true,
  },
  {
    key: 'gdrive',
    icon: '🟢',
    label: 'Google Drive',
    sub: 'Files go to a private "iLab Files" folder in your own Google Drive. Access them from any device through Google Drive.',
    color: '#1a73e8',
    bg: '#e8f0fe',
    personal: true,
    oauth: true,
  },
  {
    key: 'onedrive',
    icon: '🔵',
    label: 'Microsoft OneDrive',
    sub: 'Files go to a private app folder in your OneDrive. Access them from any device through OneDrive.',
    color: '#0078d4',
    bg: '#e3f2fd',
    personal: true,
    oauth: true,
  },
  {
    key: 'filesystem',
    icon: '📱',
    label: 'iCloud / Device',
    sub: 'Mobile only. On iPhone/iPad, files sync to your iCloud Drive. On Android, files save to the app\'s local Documents folder.',
    color: '#0369a1',
    bg: '#e0f2fe',
    personal: true,
    mobileOnly: true,
  },
]

function ExplainerModal({ option, onAccept, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{option.icon}</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>How {option.label} works</div>

        <div style={{ background: '#fff3e0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong>Hybrid mode:</strong> Shared files visible to your team (equipment SOPs, supply photos, module images) always stay in iLab Cloud. Only <em>your personal files</em> (training certificates, project records, your uploads) go to {option.label}.
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>✅ <strong>Your files stay private</strong> — only you can see them. The app never accesses anything outside the folder/location it creates.</div>
          <div style={{ marginBottom: 8 }}>✅ <strong>You own your data</strong> — open {option.label} at any time to see, download, or delete your files directly.</div>
          <div style={{ marginBottom: 8 }}>⚠️ <strong>Sharing with teammates</strong> — personal files are private. To share one, re-upload it through the app.</div>
          <div>⚠️ <strong>Existing files stay in iLab Cloud</strong> — only new uploads go to {option.label}. Old files are not moved.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onAccept}>I understand — continue</button>
        </div>
      </div>
    </div>
  )
}

export default function StorageProviderModal({ onClose, toast }) {
  const current = useAppStore(s => s.storageProviderKey)
  const [confirming, setConfirming] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [statuses, setStatuses] = useState({})

  // Filter out localfolder if browser doesn't support File System Access API
  const visibleOptions = OPTIONS.filter(o => {
    if (o.key === 'localfolder') return localFolderSupported()
    return true
  })

  function refreshStatuses() {
    const s = {}
    OPTIONS.forEach(o => { s[o.key] = providers[o.key]?.isConnected() })
    setStatuses(s)
  }

  useEffect(() => {
    refreshStatuses()
    window.addEventListener('focus', refreshStatuses)
    return () => window.removeEventListener('focus', refreshStatuses)
  }, [])

  function handleSelect(option) {
    if (option.key === current) return
    if (option.key === 'supabase') { activate(option); return }
    if (providers[option.key]?.isConnected()) { activate(option); return }
    if (localStorage.getItem(`ilab_storage_seen_${option.key}`)) { activate(option); return }
    setConfirming(option)
  }

  async function activate(option) {
    setConfirming(null)
    if (option.personal) localStorage.setItem(`ilab_storage_seen_${option.key}`, '1')

    if (option.localfolder) {
      setConnecting(option.key)
      try {
        await providers.localfolder.pickFolder()
        useAppStore.getState().setStorageProviderKey('localfolder')
        setStatuses(s => ({ ...s, localfolder: true }))
        toast('Local folder connected ✓')
      } catch (e) {
        if (e.name !== 'AbortError') toast('Could not access folder: ' + (e.message || 'Permission denied'))
      }
      setConnecting(null)
      return
    }

    if (option.oauth && !providers[option.key].isConnected()) {
      setConnecting(option.key)
      try {
        await providers[option.key].connect()
        toast(`${option.label}: complete sign-in in the browser that opened.`)
      } catch (e) {
        toast('Could not open auth browser: ' + (e.message || ''))
      }
      setConnecting(null)
      return
    }

    useAppStore.getState().setStorageProviderKey(option.key)
    setStatuses(s => ({ ...s, [option.key]: true }))
    toast(`Storage switched to ${option.label} ✓`)
  }

  async function disconnect(option, e) {
    e.stopPropagation()
    await providers[option.key].disconnect?.()
    setStatuses(s => ({ ...s, [option.key]: false }))
    if (current === option.key) {
      useAppStore.getState().setStorageProviderKey('supabase')
      toast(`Disconnected from ${option.label}. Switched back to iLab Cloud.`)
    } else {
      toast(`${option.label} disconnected.`)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 520, width: '100%', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>File Storage</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
          Choose where your personal files are stored. Shared team files always stay in iLab Cloud.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleOptions.map(option => {
            const isActive = current === option.key
            const isConnected = statuses[option.key]
            return (
              <div key={option.key} onClick={() => handleSelect(option)}
                style={{ border: `2px solid ${isActive ? option.color : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', background: isActive ? option.bg : 'var(--surface)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{option.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{option.label}</span>
                    {isActive && <span style={{ fontSize: 11, background: option.color, color: '#fff', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>Active</span>}
                    {!isActive && isConnected && option.personal && <span style={{ fontSize: 11, background: '#e8f2ee', color: '#1D9E75', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>Connected</span>}
                    {option.mobileOnly && <span style={{ fontSize: 11, background: '#f0efe9', color: '#6b6860', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>Mobile</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{option.sub}</div>
                </div>
                {option.personal && isConnected && !isActive && (
                  <button onClick={e => disconnect(option, e)} className="btn btn-sm" style={{ flexShrink: 0, fontSize: 11 }}>Disconnect</button>
                )}
                {isActive && option.personal && (
                  <button onClick={e => disconnect(option, e)} className="btn btn-sm" style={{ flexShrink: 0, fontSize: 11 }}>Disconnect</button>
                )}
                {connecting === option.key && <div className="spinner" style={{ width: 18, height: 18, flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
          <strong>What stays in iLab Cloud regardless of your choice:</strong> equipment SOPs, supply photos, module images, floor plans, org-wide content. These are shared with your team and cannot be moved to personal storage.
        </div>
      </div>

      {confirming && <ExplainerModal option={confirming} onAccept={() => activate(confirming)} onCancel={() => setConfirming(null)} />}
    </div>
  )
}
