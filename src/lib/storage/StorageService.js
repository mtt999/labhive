// StorageService — Mode B hybrid router
//
// personal: false  → always Supabase (shared org files: SOPs, equipment photos, module images)
// personal: true   → user's chosen provider (training certs, project records, personal uploads)
//
// External file refs are stored as "ext:provider:id" strings in the DB instead of URLs.
// Call StorageService.resolveUrl(storedValue) to get a usable URL for display.

import { SupabaseProvider } from './SupabaseProvider'
import { FilesystemProvider } from './FilesystemProvider'
import { GoogleDriveProvider } from './GoogleDriveProvider'
import { OneDriveProvider } from './OneDriveProvider'
import { LocalFolderProvider } from './LocalFolderProvider'

export const PROVIDER_KEY = 'ilab_storage_provider'

export const providers = {
  supabase:     new SupabaseProvider(),
  filesystem:   new FilesystemProvider(),
  gdrive:       new GoogleDriveProvider(),
  onedrive:     new OneDriveProvider(),
  localfolder:  new LocalFolderProvider(),
}

export function getActiveProviderKey() {
  return localStorage.getItem(PROVIDER_KEY) || 'supabase'
}

export function setActiveProviderKey(key) {
  localStorage.setItem(PROVIDER_KEY, key)
}

export function getActiveProvider() {
  return providers[getActiveProviderKey()] || providers.supabase
}

// Returns true if the stored value is an external ref (not a plain URL)
export function isExternalRef(value) {
  return typeof value === 'string' && value.startsWith('ext:')
}

// Parses "ext:gdrive:FILE_ID" → { providerKey: 'gdrive', ref: 'FILE_ID' }
function parseRef(extRef) {
  const parts = extRef.split(':')
  // ext : providerKey : ...rest (ref may contain colons e.g. webdav paths)
  const providerKey = parts[1]
  const ref = parts.slice(2).join(':')
  return { providerKey, ref }
}

const StorageService = {
  // Upload a file.
  // personal:true → route to user's chosen provider
  // personal:false → always Supabase (shared org content)
  async upload(bucket, path, file, { personal = false } = {}) {
    const providerKey = getActiveProviderKey()
    const result = (!personal || providerKey === 'supabase')
      ? await providers.supabase.upload(bucket, path, file)
      : await getActiveProvider().upload(bucket, path, file)

    if (personal && providerKey === 'supabase' && !localStorage.getItem('ilab_storage_hint_shown')) {
      localStorage.setItem('ilab_storage_hint_shown', '1')
      setTimeout(() => {
        import('../../store/useAppStore').then(({ useAppStore }) => {
          useAppStore.getState().toast('File saved to LabHive Cloud. Go to Profile → Storage to use your local folder, Google Drive, or OneDrive instead.')
        }).catch(() => {})
      }, 900)
    }

    return result
  },

  // Resolve a stored value to a displayable URL.
  // If it's a plain URL, returns it as-is.
  // If it's "ext:...", fetches a blob URL from the correct provider.
  async resolveUrl(stored) {
    if (!stored) return null
    if (!isExternalRef(stored)) return stored
    const { providerKey, ref } = parseRef(stored)
    const provider = providers[providerKey]
    if (!provider) return null
    return provider.resolveUrl(`ext:${providerKey}:${ref}`)
  },

  // Remove a file. Works for both Supabase paths and external refs.
  async remove(bucket, stored) {
    if (!stored) return
    if (!isExternalRef(stored)) {
      return providers.supabase.remove(bucket, stored)
    }
    const { providerKey, ref } = parseRef(stored)
    const provider = providers[providerKey]
    if (provider) await provider.remove(bucket, `ext:${providerKey}:${ref}`)
  },

  isConnected() { return getActiveProvider().isConnected() },
}

export default StorageService

// React hook — resolves an external ref to a blob URL for use in <img> / <a>
// Usage: const url = useStorageUrl(record.certificate_url)
import { useState, useEffect } from 'react'
export function useStorageUrl(stored) {
  const [resolved, setResolved] = useState(() => isExternalRef(stored) ? null : stored)
  useEffect(() => {
    if (!stored) { setResolved(null); return }
    if (!isExternalRef(stored)) { setResolved(stored); return }
    let cancelled = false
    StorageService.resolveUrl(stored).then(url => { if (!cancelled) setResolved(url) })
    return () => { cancelled = true }
  }, [stored])
  return resolved
}
