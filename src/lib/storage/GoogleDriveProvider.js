// Google Drive provider — PKCE OAuth, stores files in "iLab Files" folder
// Requires a Google Cloud project with Drive API enabled.
// Set your Client ID in src/lib/storage/config.js

import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './config'

const REDIRECT_URI = 'https://ilabapp.org/ilab/oauth-callback'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'ilab_gdrive_token'
const FOLDER_KEY = 'ilab_gdrive_folder_id'
const VERIFIER_KEY = 'ilab_gdrive_verifier'

function saveToken(token) { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)) }
function loadToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)) } catch { return null }
}

async function getValidToken() {
  let token = loadToken()
  if (!token) return null
  if (Date.now() < token.expires_at - 60_000) return token.access_token
  if (!token.refresh_token) { localStorage.removeItem(TOKEN_KEY); return null }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: token.refresh_token, grant_type: 'refresh_token' }),
  })
  const data = await res.json()
  if (data.error) { localStorage.removeItem(TOKEN_KEY); return null }
  const updated = { ...token, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }
  saveToken(updated)
  return updated.access_token
}

async function driveReq(path, opts = {}) {
  const token = await getValidToken()
  if (!token) throw new Error('Not connected to Google Drive')
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`)
  return res
}

async function getOrCreateFolder() {
  const cached = localStorage.getItem(FOLDER_KEY)
  if (cached) return cached
  const res = await driveReq(`/files?q=${encodeURIComponent("name='iLab Files' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)`)
  const { files } = await res.json()
  if (files?.length) { localStorage.setItem(FOLDER_KEY, files[0].id); return files[0].id }
  const create = await driveReq('/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'iLab Files', mimeType: 'application/vnd.google-apps.folder' }),
  })
  const folder = await create.json()
  localStorage.setItem(FOLDER_KEY, folder.id)
  return folder.id
}

// PKCE helpers
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
function generateVerifier() {
  const buf = new Uint8Array(32); crypto.getRandomValues(buf); return base64url(buf)
}
async function generateChallenge(verifier) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(buf)
}

export class GoogleDriveProvider {
  isConnected() { return !!loadToken() }

  async connect() {
    const verifier = generateVerifier()
    const challenge = await generateChallenge(verifier)
    localStorage.setItem(VERIFIER_KEY, verifier)
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'gdrive',
    })
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    if (window.Capacitor?.isNativePlatform?.()) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
    } else {
      window.location.href = url
    }
  }

  async handleCallback(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verifier }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error_description || data.error || `HTTP ${res.status}`)
    saveToken({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 })
    localStorage.removeItem(VERIFIER_KEY)
  }

  disconnect() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(FOLDER_KEY)
  }

  async upload(_bucket, path, file) {
    const folderId = await getOrCreateFolder()
    const metadata = { name: path.split('/').pop(), parents: [folderId] }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', file)
    const token = await getValidToken()
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) throw new Error('Google Drive upload failed')
    const { id } = await res.json()
    const ref = `ext:gdrive:${id}`
    return { url: ref, ref }
  }

  async resolveUrl(fileId) {
    try {
      const token = await getValidToken()
      if (!token) return null
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch { return null }
  }

  async remove(_bucket, ref) {
    try {
      const fileId = ref.replace('ext:gdrive:', '')
      await driveReq(`/files/${fileId}`, { method: 'DELETE' })
    } catch {}
  }
}
