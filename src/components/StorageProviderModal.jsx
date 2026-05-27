import { useState, useEffect } from 'react'
import { providers, getActiveProviderKey, setActiveProviderKey } from '../lib/storage/StorageService'
import { getWebDAVConfig, saveWebDAVConfig } from '../lib/storage/WebDAVProvider'

const OPTIONS = [
  {
    key: 'supabase',
    icon: '☁️',
    label: 'iLab Cloud',
    sub: 'Default — files stored securely on iLab servers',
    color: '#1D9E75',
    bg: '#e8f2ee',
    personal: false,
  },
  {
    key: 'filesystem',
    icon: '📱',
    label: 'iCloud / Device',
    sub: 'iOS: syncs to your iCloud Drive. Android: local Documents folder.',
    color: '#0369a1',
    bg: '#e0f2fe',
    personal: true,
  },
  {
    key: 'gdrive',
    icon: '🟢',
    label: 'Google Drive',
    sub: 'Stored in your private "iLab Files" folder on Google Drive',
    color: '#1a73e8',
    bg: '#e8f0fe',
    personal: true,
    oauth: true,
  },
  {
    key: 'onedrive',
    icon: '🔵',
    label: 'Microsoft OneDrive',
    sub: 'Stored in your private OneDrive app folder',
    color: '#0078d4',
    bg: '#e3f2fd',
    personal: true,
    oauth: true,
  },
  {
    key: 'webdav',
    icon: '🖥️',
    label: 'Personal Computer',
    sub: 'Your own computer or NAS via WebDAV (same network or VPN)',
    color: '#7c4dbd',
    bg: '#f3eeff',
    personal: true,
    webdav: true,
  },
]

function ExplainerModal({ option, onAccept, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{option.icon}</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>How {option.label} works</div>

        <div style={{ background: '#fff3e0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong>Hybrid mode (recommended):</strong> Shared files visible to your teammates (equipment SOPs, supply photos, module images) always stay in iLab Cloud. Only <em>your personal files</em> (training certificates, project records, your uploads) go to {option.label}.
        </div>

        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>✅ <strong>Your files are private</strong> — the app only accesses the folder it creates, nothing else in your {option.label}.</div>
          <div style={{ marginBottom: 8 }}>✅ <strong>You own your data</strong> — open your {option.label} at any time to see, download, or delete your files.</div>
          <div style={{ marginBottom: 8 }}>⚠️ <strong>Sharing with teammates</strong> — files in {option.label} are private. To share a file with a teammate, you'll need to re-upload it from your {option.label} through the app.</div>
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

function WebDAVSetupModal({ onSave, onCancel, toast }) {
  const existing = getWebDAVConfig() || {}
  const [form, setForm] = useState({ url: existing.url || '', username: existing.username || '', password: existing.password || '' })
  const [testing, setTesting] = useState(false)

  async function handleSave() {
    if (!form.url.trim()) { toast('Server URL is required'); return }
    setTesting(true)
    try {
      const { WebDAVProvider } = await import('../lib/storage/WebDAVProvider')
      const p = new WebDAVProvider()
      const ok = await p.testConnection(form)
      if (!ok) { toast('Could not connect. Check the URL and credentials.'); setTesting(false); return }
      saveWebDAVConfig(form)
      toast('WebDAV connected ✓')
      onSave()
    } catch (e) {
      toast('Connection failed: ' + (e.message || 'Check server URL'))
    }
    setTesting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🖥️ Connect personal computer</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>Your computer must be running a WebDAV server and be reachable (same Wi-Fi or Tailscale VPN).</div>

        <div style={{ background: '#f3eeff', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#7c4dbd' }}>
          <strong>Quick setup:</strong> macOS → System Settings → Sharing → File Sharing → enable WebDAV.
          Windows → IIS Manager → add WebDAV Authoring Rules.
          Synology NAS → Control Panel → File Services → enable WebDAV.
        </div>

        <div className="field"><label>Server URL</label>
          <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="http://192.168.1.100:80 or https://yourserver.local" />
        </div>
        <div className="grid-2">
          <div className="field"><label>Username</label><input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={testing}>{testing ? 'Testing connection…' : 'Connect & save'}</button>
        </div>
      </div>
    </div>
  )
}

export default function StorageProviderModal({ onClose, toast }) {
  const [current, setCurrent] = useState(getActiveProviderKey())
  const [confirming, setConfirming] = useState(null)   // option pending explainer
  const [webdavSetup, setWebdavSetup] = useState(false)
  const [connecting, setConnecting] = useState(null)
  const [statuses, setStatuses] = useState({})

  useEffect(() => {
    const s = {}
    OPTIONS.forEach(o => { s[o.key] = providers[o.key]?.isConnected() })
    setStatuses(s)
  }, [])

  function handleSelect(option) {
    if (option.key === current) return
    if (option.key === 'supabase') { activate(option); return }
    setConfirming(option)
  }

  async function activate(option) {
    setConfirming(null)
    if (option.webdav) { setWebdavSetup(true); return }
    if (option.oauth && !providers[option.key].isConnected()) {
      setConnecting(option.key)
      try {
        await providers[option.key].connect()
        // OAuth callback will finish the flow — provider becomes active after callback
        toast(`${option.label}: complete sign-in in the browser that opened.`)
      } catch (e) {
        toast('Could not open auth browser: ' + (e.message || ''))
      }
      setConnecting(null)
      return
    }
    setActiveProviderKey(option.key)
    setCurrent(option.key)
    toast(`Storage switched to ${option.label} ✓`)
  }

  function handleWebDAVSaved() {
    setWebdavSetup(false)
    setActiveProviderKey('webdav')
    setCurrent('webdav')
    setStatuses(s => ({ ...s, webdav: true }))
  }

  async function disconnect(option, e) {
    e.stopPropagation()
    if (option.oauth) providers[option.key].disconnect?.()
    if (option.webdav) providers[option.key].disconnect?.()
    setStatuses(s => ({ ...s, [option.key]: false }))
    if (current === option.key) {
      setActiveProviderKey('supabase')
      setCurrent('supabase')
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
          {OPTIONS.map(option => {
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
      {webdavSetup && <WebDAVSetupModal onSave={handleWebDAVSaved} onCancel={() => setWebdavSetup(false)} toast={toast} />}
    </div>
  )
}
