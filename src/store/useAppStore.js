import { create } from 'zustand'
import { sb } from '../lib/supabase'

export const useAppStore = create((set, get) => ({
  // ── Auth ──
  session: null,
  setSession: (s) => set({ session: s }),
  clearSession: () => {
    sb.auth.signOut()
    localStorage.removeItem('ilab_login_mode')
    set({ session: null, loginMode: null, sharedWorkspaces: [], viewingWorkspaceOwnerId: null, activeModules: null, currentProjectId: null })
  },

  // ── Active dashboard modules (icon picker) ──
  activeModules: null,
  setActiveModules: (modules) => set({ activeModules: modules }),

  // ── Login mode: 'team' | 'solo' | null ──
  loginMode: null,
  setLoginMode: (m) => set({ loginMode: m }),

  // ── Solo workspace sharing ──
  sharedWorkspaces: [],          // [{ ownerId, ownerName }] — workspaces the current solo user is a member of
  setSharedWorkspaces: (ws) => set({ sharedWorkspaces: ws }),
  viewingWorkspaceOwnerId: null, // null = own workspace, uuid = viewing that owner's workspace
  setViewingWorkspaceOwnerId: (id) => set({ viewingWorkspaceOwnerId: id }),

  // ── Cache ──
  rooms: [],
  supplies: [],
  settings: {},

  refreshCache: async () => {
    const session = get().session
    const isSolo = session?.loginMode === 'solo'
    const mode = isSolo ? 'solo' : 'team'
    let roomsQ = sb.from('rooms').select('*').eq('login_mode', mode).order('created_at')
    let suppliesQ = sb.from('supplies').select('*').eq('login_mode', mode).order('created_at')
    if (!isSolo) {
      const safeOrgId = session?.organizationId || '00000000-0000-0000-0000-000000000000'
      roomsQ = roomsQ.eq('organization_id', safeOrgId)
      suppliesQ = suppliesQ.eq('organization_id', safeOrgId)
    }
    const [r, s, cfg] = await Promise.all([roomsQ, suppliesQ, sb.from('settings').select('*')])
    const settings = {}
    ;(cfg.data || []).forEach((x) => (settings[x.key] = x.value))
    set({ rooms: r.data || [], supplies: s.data || [], settings })
  },

  // ── Toast ──
  toastMsg: '',
  toastVisible: false,
  toast: (msg) => {
    set({ toastMsg: msg, toastVisible: true })
    setTimeout(() => set({ toastVisible: false }), 2500)
  },

  // ── Navigation ──
  screen: 'dashboard',
  setScreen: (s) => set({ screen: s }),
  pendingAdminTab: null,
  setPendingAdminTab: (tab) => set({ pendingAdminTab: tab }),
  pendingProfileTab: null,
  setPendingProfileTab: (tab) => set({ pendingProfileTab: tab }),

  // ── Inspection state ──
  inspection: null,
  setInspection: (i) => set({ inspection: i }),

  // ── Last completed inspection record ──
  lastRecord: null,
  setLastRecord: (r) => set({ lastRecord: r }),

  // ── Current project ──
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // ── Equipment QR scan (from URL param ?eq=<uuid>) ──
  scanEquipmentId: null,
  setScanEquipmentId: (id) => set({ scanEquipmentId: id }),
  clearScanEquipmentId: () => set({ scanEquipmentId: null }),
}))
