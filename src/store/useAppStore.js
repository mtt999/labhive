import { create } from 'zustand'
import { sb } from '../lib/supabase'

export const useAppStore = create((set, get) => ({
  // ── Auth ──
  session: null,
  setSession: (s) => set({ session: s }),
  clearSession: () => {
    sb.auth.signOut()
    localStorage.removeItem('ilab_login_mode')
    localStorage.removeItem('ilab_active_identity')
    // Demo restrictions are decided at sign-in (public demo/demo vs the real
    // password). Clearing this on logout means the next sign-in re-evaluates
    // rather than inheriting the previous person's unlocked state.
    localStorage.removeItem('ilab_demo_public')
    set({ session: null, loginMode: null, sharedWorkspaces: [], viewingWorkspaceOwnerId: null, activeModules: null, currentProjectId: null, sidebarSubTab: null, screen: 'dashboard' })
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
    // Never query without a scope key — a bare login_mode filter would return
    // every org's / every solo user's rows. NONE is a UUID that matches nothing.
    const NONE = '00000000-0000-0000-0000-000000000000'
    let roomsQ = sb.from('rooms').select('*').eq('login_mode', mode).order('created_at')
    let suppliesQ = sb.from('supplies').select('*').eq('login_mode', mode).order('created_at')
    if (isSolo) {
      const soloId = session?.userId || NONE
      roomsQ = roomsQ.eq('solo_owner_id', soloId)
      suppliesQ = suppliesQ.eq('solo_owner_id', soloId)
    } else {
      const safeOrgId = session?.organizationId || NONE
      roomsQ = roomsQ.eq('organization_id', safeOrgId)
      suppliesQ = suppliesQ.eq('organization_id', safeOrgId)
    }
    const [r, s, cfg] = await Promise.all([roomsQ, suppliesQ, sb.from('settings').select('*')])
    const settings = {}
    ;(cfg.data || []).forEach((x) => (settings[x.key] = x.value))
    // Natural alphanumeric sort so "Room 2" sorts before "Room 10" — every
    // screen (Rooms tab, Supplies tab, Inspect grid, room dropdowns) reads
    // rooms from this store, so sorting once here orders it everywhere.
    const sortedRooms = [...(r.data || [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    )
    set({ rooms: sortedRooms, supplies: s.data || [], settings })
  },

  // ── Toast ──
  toastMsg: '',
  toastVisible: false,
  toastIsError: false,
  toast: (msg, forceError) => {
    const isError = !!forceError || /error|failed|conflict|blocked|^please|^could not|^invalid|^unable|^cannot|^select |^set a |^describe|^complete.*train/i.test(msg?.trim())
    set({ toastMsg: msg, toastVisible: true, toastIsError: isError })
    if (!isError) setTimeout(() => set({ toastVisible: false }), 2500)
  },
  dismissToast: () => set({ toastVisible: false, toastIsError: false }),

  // ── Navigation ──
  screen: 'dashboard',
  setScreen: (s) => set({ screen: s, sidebarSubTab: null }),

  // ── Sidebar sub-tab (set by Layout sidebar, read by each screen) ──
  sidebarSubTab: null,
  setSidebarSubTab: (key) => set({ sidebarSubTab: key }),
  pendingAdminTab: null,
  setPendingAdminTab: (tab) => set({ pendingAdminTab: tab }),
  pendingProfileTab: null,
  setPendingProfileTab: (tab) => set({ pendingProfileTab: tab }),
  pendingBookingNotif: null,
  setPendingBookingNotif: (n) => set({ pendingBookingNotif: n }),

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

  // ── Storage provider (mirrors localStorage ilab_storage_provider) ──
  storageProviderKey: localStorage.getItem('ilab_storage_provider') || 'supabase',
  setStorageProviderKey: (key) => {
    localStorage.setItem('ilab_storage_provider', key)
    set({ storageProviderKey: key })
  },

  // ── UI Guidance tooltips ──
  showTooltips: localStorage.getItem('ilab_show_tooltips') !== 'false',
  setShowTooltips: (val) => {
    localStorage.setItem('ilab_show_tooltips', val ? 'true' : 'false')
    if (val) document.body.classList.remove('tooltips-off')
    else document.body.classList.add('tooltips-off')
    set({ showTooltips: val })
  },
}))
