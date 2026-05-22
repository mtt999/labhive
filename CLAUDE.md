# iLab — Claude Code Instructions

This file applies to every session working on the `original-ilab` project. Read it in full before making any changes.

---

## Project overview

**iLab** is a React 18 + Vite SPA (single-page app) for lab management. It is:
- Built with React 18, Vite 5, Zustand 4, Supabase JS v2
- Deployed on **GitHub Pages** at `https://mtt999.github.io/ilab/` (Vite base: `/ilab/`)
- Admin route: `https://mtt999.github.io/ilab/admin`
- Backend: **Supabase** (no RLS — custom auth via `users` / `solo_users` tables)
- Supabase URL: `https://qhsxtpywfczqopcimykk.supabase.co`
- Supabase key (publishable/anon): in `src/lib/supabase.js`
- Storage bucket: `project-files` (used for module images, SOP files, etc.)
- Source: `src/` | Build output: `docs/` | Git repo: `https://github.com/mtt999/ilab`

**Build & deploy:**
```bash
npm run build   # builds to docs/, then postbuild copies docs/admin/index.html
git add docs/ && git commit -m "..." && git push
```

---

## Critical rules — do NOT break these

### 1. activeModules lives in the Zustand store — never move it back to local state

`activeModules` (which icons show on the dashboard) is stored in `useAppStore` (`src/store/useAppStore.js`).

**Why:** It used to be local state in Dashboard.jsx. Changes made from Profile (solo users) were never reflected until a page reload. The fix moved it to the global store so the icon picker can update it from any screen instantly.

**Rules:**
- `Dashboard.jsx` must read `activeModules` from `useAppStore()` — never `useState(null)`
- `DashboardIconPicker.jsx` must call `setActiveModules(modules)` from `useAppStore()` inside its `save()` function, after every save
- `clearSession` in the store must reset `activeModules: null`
- Do NOT add a separate `activeModules` state to any screen or component

### 2. Mileage (and labsafety) icons must respect activeModules — never hardcode them

- Any module list rendered in Dashboard must be filtered by `activeModules` if it is set
- `StudentDashboardView` receives `activeModules` as a prop and filters `allQuickLinks` with it
- `CardGridView` for students uses `activeModules` to filter `getAllModulesForStudent()`
- Never add a hardcoded list of modules that bypasses `activeModules`

### 3. External link icons (mileage, labsafety) use the ExternalLinkModal — never open URLs directly

Clicking an external module card must go through `setConfirmExternal({ url })` → `ExternalLinkModal`. Do not call `window.open()` directly. `ExternalLinkModal` handles empty/invalid URLs gracefully.

### 4. New screens must be added to BOTH UNMANAGED_SCREENS and INTERNAL

- **`UNMANAGED_SCREENS`** in `Dashboard.jsx` — controls whether the icon *shows* on the dashboard for team users
- **`INTERNAL`** in `App.jsx` — controls whether navigating to the screen is *allowed* without a `user_screen_access` entry

**Current values (must match):**
- `UNMANAGED_SCREENS` (Dashboard.jsx): `profile`, `dashboard`, `pm`, `barcode`, `barcodeqr`, `orgadmin`, `home`, `equipment`, `labmanagement`
- `INTERNAL` (App.jsx): `dashboard`, `profile`, `inspection`, `results`, `project-detail`, `pm`, `barcode`, `equipmentscan`, `barcodeqr`, `orgadmin`, `home`, `equipment`, `projects`, `training`, `history`, `equipmenthub`, `booking`, `remessages`, `labmanagement`

### 5. clearSession must always remove localStorage keys

`clearSession()` in `useAppStore.js` must call:
```js
localStorage.removeItem('ilab_session')
localStorage.removeItem('ilab_login_mode')
```
before calling `set(...)`. Never remove these lines.

### 6. Session persistence — save to localStorage on every login

Every `setSession(...)` call in `src/screens/auth/Login.jsx` must be immediately followed by:
```js
localStorage.setItem('ilab_session', JSON.stringify(sessionObject))
```
There are 3 login paths: super admin, team user, solo. All three must save to localStorage.

### 7. Icon pool: org pool OVERRIDES global pool — never intersect them

The effective module pool for a team user is computed as:
```js
const effectivePool = orgPool ?? appPool
```
**Not** `orgPool.filter(k => appPool.includes(k))`. If an org has its own pool set by super admin, that pool is authoritative for that org, regardless of the global app pool.

This rule applies in three places (all must be consistent):
- `Dashboard.jsx` `loadDashboardPrefs()`
- `DashboardIconPicker.jsx` `loadSaved()`
- `Profile.jsx` `DashboardIconsPanel.load()`

### 8. Pool filtering must append newly-enabled modules — not silently drop them

When applying an effective pool to a user's saved `active_modules`:
```js
if (effectivePool !== null) {
  if (mods?.length) {
    const filtered = mods.filter(k => effectivePool.includes(k) || k === 'profile')
    const missing = effectivePool.filter(k => !filtered.includes(k) && k !== 'profile')
    mods = [...filtered, ...missing]  // preserve order + add newly-allowed
  } else {
    mods = effectivePool  // no saved prefs → use pool as initial list
  }
}
```
Never do `mods = mods.filter(...)` alone — that drops newly-enabled modules for users who saved before the module was added.

---

## Architecture overview

### Login modes
| Mode | Table | Accent color | Notes |
|------|-------|--------------|-------|
| `solo` | `solo_users` | `#534AB7` purple | Personal lab workspace |
| `team` | `users` | `#1D9E75` green | Org-based team account |
| `admin` (team) | `users` | `#1D9E75` green | `role = 'admin'`; org admin or super admin |

### Role hierarchy
| Role | `userId` | Access |
|------|----------|--------|
| Super admin | `null` | All orgs, all data. Logs in at `/ilab/admin` via `settings.admin_email` + `settings.admin_password` |
| Org admin | non-null UUID | Their own `organizationId` only. Entry via Admin Panel card on dashboard |
| Lab manager | non-null UUID | `role = 'user'`. Access controlled by `user_screen_access` table |
| Lab user | non-null UUID | `role = 'student'`. Restricted module set |

`Admin.jsx` (`src/screens/admin/Admin.jsx`) detects super admin via `session.userId === null`.

### Multi-tenancy
- `organizations` table: `id` (UUID), `name`, `slug`, `created_at`, `allowed_modules` (JSONB), `module_images` (JSONB)
- **ICT org UUID**: `5bab5b33-fff9-4a4a-b617-3dac179f9678`
- All team data tables have `organization_id` UUID FK

**Required SQL migrations (run in Supabase SQL Editor if not done):**
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS module_images JSONB DEFAULT NULL;
```

### Global store (`src/store/useAppStore.js`)
| Field | Purpose |
|-------|---------|
| `session` | Current user session |
| `activeModules` | Array of module keys visible on dashboard (`null` = show all) |
| `sharedWorkspaces` | Solo workspaces the user is a member of |
| `viewingWorkspaceOwnerId` | `null` = own workspace; uuid = shared workspace |
| `scanEquipmentId` | UUID from `?eq=` URL param — set on QR scan, cleared after use |
| `pendingAdminTab` | Tab key to switch to when navigating to `orgadmin` screen |

---

## Module icon pool system

### Three-layer hierarchy
```
Super admin → Global app pool (settings.app_allowed_modules)
           OR per-org pool (organizations.allowed_modules)
                    ↓
          Org admin → User's saved selection (user_dashboard_prefs.active_modules)
```

Solo users have a separate pool: `settings.solo_allowed_modules`.

### How the pool is resolved (team users)
1. Fetch `organizations.allowed_modules` for the user's org (`orgPool`)
2. Fetch `settings.app_allowed_modules` (`appPool`)
3. `effectivePool = orgPool ?? appPool` — org pool wins if set; global is fallback
4. If `effectivePool !== null`: filter user's saved modules, append any newly-enabled ones
5. If no saved prefs: `activeModules = effectivePool`

### Settings table keys
| Key | Meaning |
|-----|---------|
| `app_allowed_modules` | JSON array of module keys allowed globally for all team orgs (fallback) |
| `solo_allowed_modules` | JSON array of module keys allowed globally for solo users |
| `img_{key}` | Global background image URL for team module card (e.g. `img_supply`) |
| `solo_img_{key}` | Global background image URL for solo module card |
| `mileage_url` | External URL for the mileage form |
| `labsafety_url` | External URL for the lab safety portal |
| `admin_email` | Super admin login email |
| `admin_password` | Super admin login password (bcrypt hashed) |

### Module image priority (Dashboard.jsx `loadSettings`)
1. Default SVG (`/ilab/icon-pm.svg`, etc.) for pm, barcode, barcodeqr, profile
2. Global images from `settings` (`img_*` for team, `solo_img_*` for solo) override defaults
3. Per-org images from `organizations.module_images` override global images for team users

### ALL_MODULES_META — single source of truth
Defined and exported from `src/components/DashboardIconPicker.jsx`. Every module definition lives here. Fields: `key`, `screen`, `label`, `sub`, `icon`, `bg`, `color`, `roles`, `external?`, `adminOnly?`, `studentLocked?`, `soloLocked?`, `hideForStaff?`

---

## Admin panel structure

### Super admin view (`session.userId === null`)
- No tab bar — all content renders directly
- Shows greeting + **Admin Panel** button + **Profile** button on home page (no icon grid)
- `Admin.jsx` shows:
  - "🌐 Main App (Global)" card → `AppModulesModal` (tabbed: Icon Access / Icon Images)
  - "👤 Solo Users (Global)" card → `SoloModulesModal` (tabbed: Icon Access / Icon Images)
  - Organization list — each org row shows inline org admin card(s) + Icons / Edit / Delete buttons
- Org admin is shown inline in the org row as a clickable card (name + email); clicking opens `UserModal` for editing

### Org admin view (`session.userId !== null`, `session.role === 'admin'`)
- Tabs: Users | Lab Users | Module Images | Org Settings
- Module Images tab uses `ModuleImagesPanel` which reads/writes `organizations.module_images` (JSONB) for their own org

### Key modal components in Admin.jsx
| Component | Purpose | Close button |
|-----------|---------|--------------|
| `AppModulesModal` | Super admin sets global team icon pool + uploads global images | × button in header |
| `SoloModulesModal` | Super admin sets global solo icon pool + uploads solo images | × button in header |
| `OrgModulesModal` | Super admin sets icon pool for a specific org | × button in header |
| `UserModal` | Add/edit user account | standard |
| `OrgModal` | Add/edit organization | standard |
| `AccessModal` | Set per-user screen access | standard |

### GlobalImageGrid component (inside Admin.jsx)
- Uploads to Supabase storage path: `module-images/global/${imagePrefix}${moduleKey}-${Date.now()}.${ext}`
- Saves URL to `settings` table as `${imagePrefix}${moduleKey}` via upsert
- `imagePrefix` is `img_` for app global, `solo_img_` for solo global

---

## Session & navigation flows

### Session persistence
1. Login → `Login.jsx` calls `setSession(obj)` + `localStorage.setItem('ilab_session', JSON.stringify(obj))`
2. App reopened → `App.jsx` reads `ilab_session` from localStorage, calls `setSession(parsed)`
3. Solo users: workspace memberships re-fetched from Supabase after restore
4. Sign out → `clearSession()` removes `ilab_session` + `ilab_login_mode` → login page

### Super admin session object
```js
{ role: 'admin', username: 'Admin', userId: null, adminLevel: 3, loginMode: 'team' }
```

### First-login forced password change
- `users.must_change_password` boolean — set `true` when admin creates a new user
- `ForcePasswordChange.jsx` (full-screen, `zIndex: 9999`) renders in `App.jsx` when `session?.mustChangePassword === true`
- Blocks entire app until user sets a new password (≥ 6 chars, different from current)
- Team users cannot change their email — email field is `readOnly` in Profile/UserModal

### QR scan flow
1. User scans QR code → URL `?eq=<uuid>`
2. `App.jsx` stores UUID in `scanEquipmentId`
3. After login → `setScreen('equipmentscan')` automatically
4. `EquipmentScan.jsx` loads equipment; user sees: SOP | Book | Contact | Calibration
5. `book` → `BookingEquipment` with equipment pre-selected
6. `sop`, `contact`, `calibration` → expand inline as `SectionCard` (back button at **bottom**)
7. Contact → "Open Messages →" sets `sessionStorage.ilab_return_scan = '1'` before navigating to `remessages`

### BookingEquipment QR back button
- `fromQRScan = useState(() => !!scanEquipmentId)` — captured at mount
- Shows "← Back to options" button (do NOT rename) → `setScreen('equipmentscan')`

---

## Key screens & components

| Screen/File | Route key | Notes |
|-------------|-----------|-------|
| `src/screens/dashboard/Dashboard.jsx` | `dashboard` | Main home; handles all 4 user types |
| `src/screens/auth/Login.jsx` | — | 3 login paths: super admin, team, solo |
| `src/screens/admin/Admin.jsx` | `orgadmin` | Admin panel for super admin and org admin |
| `src/screens/profile/Profile.jsx` | `profile` | Profile + DashboardIconsPanel (inline icon picker) |
| `src/screens/equipment/EquipmentInventory.jsx` | `equipment` | — |
| `src/screens/equipment/EquipmentHub.jsx` | `equipmenthub` | Student equipment browser |
| `src/screens/training/TrainingRecords.jsx` | `training` | — |
| `src/screens/projects/ProjectMaterial.jsx` | `projects` | Route MUST go here, not Projects.jsx |
| `src/screens/barcode/BarcodeManager.jsx` | `barcodeqr` | 3 tabs: Equipment Barcode, Records, Project Materials |
| `src/screens/EquipmentScan.jsx` | `equipmentscan` | QR scan landing page |
| `src/components/DashboardIconPicker.jsx` | — | Full-screen icon picker modal + ALL_MODULES_META |
| `src/components/Layout.jsx` | — | App shell; mobile bottom nav (< 768px) |
| `src/components/TeammatesPanel.jsx` | — | Solo workspace sharing; imported, never inline |
| `src/store/useAppStore.js` | — | Zustand global store |

### Mobile bottom navigation (Layout.jsx)
- Shown on screens < 768px wide only
- 5 tabs: Home | Booking | Messages | Projects | Profile
- `useIsMobile()` hook defined in Layout.jsx — do NOT duplicate it elsewhere
- Main content gets `paddingBottom: calc(72px + Xpx)` to avoid hiding behind nav

### BarcodeManager
- 3 tabs: Equipment Barcode | Records | Project Materials
- No Settings tab — access control is in Profile → Dashboard Icons
- `barcodeqr` is `studentLocked: true` — lab users see it locked, lab managers use freely
- Print logo is pure B&W SVG (no gray — invisible on monochrome printers)

### Solo workspace sharing
- `solo_workspace_invites` — pending/accepted/declined invites
- `solo_workspace_members` — accepted memberships
- `TeammatesPanel` component shared between Profile and ProjectMaterial

### Post-build script
`scripts/post-build.mjs` runs after `npm run build`. Copies `docs/index.html` → `docs/admin/index.html` with title "iLab — Admin". **Never manually edit `docs/admin/index.html`.**

---

## SQL — all tables & key columns

### Core tables (team)
- `users`: `id`, `name`, `email`, `password_hash`, `role` (admin/user/student), `organization_id`, `is_active`, `must_change_password`, `photo_url`, `avatar`
- `organizations`: `id`, `name`, `slug`, `created_at`, `allowed_modules` (JSONB), `module_images` (JSONB)
- `user_screen_access`: `user_id`, `screen_key` — per-user screen grants
- `user_dashboard_prefs`: `user_id`, `active_modules` (array), `allowed_modules` (array), `has_set_dashboard`

### Core tables (solo)
- `solo_users`: `id`, `name`, `email`, `password_hash`, `active_modules` (array), `has_set_dashboard`
- `solo_workspace_invites`, `solo_workspace_members`
- `projects`: includes `solo_owner_id` column
- `project_results`, `project_links`

### Global settings
- `settings`: `key` (PK), `value` — key/value store for URLs, passwords, module pools, images

### Required SQL (run once if not applied)
```sql
-- Multi-tenancy org columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_modules JSONB DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS module_images JSONB DEFAULT NULL;

-- Solo workspace sharing (from supabase_solo_workspace.sql)
-- Run supabase_solo_workspace.sql in Supabase SQL Editor
```

---

## Common mistakes to avoid

- **Do not** re-introduce `const [activeModules, setActiveModules] = useState(null)` in Dashboard.jsx
- **Do not** use `orgPool.filter(k => appPool.includes(k))` — use `orgPool ?? appPool`
- **Do not** filter saved modules by pool without also appending newly-enabled modules
- **Do not** add mileage or labsafety to any hardcoded module list that bypasses `activeModules`
- **Do not** route `projects` to `<Projects />` — it must go to `<ProjectMaterial />`
- **Do not** define `TeammatesPanel` inline in Profile.jsx — import from `src/components/TeammatesPanel.jsx`
- **Do not** remove `setActiveModules(modules)` from `DashboardIconPicker.save()`
- **Do not** remove localStorage cleanup from `clearSession()` — users will never sign out properly
- **Do not** call `window.open()` directly from QR scan or external link handlers — use `ExternalLinkModal`
- **Do not** add a Settings tab back to BarcodeManager — access control lives in Profile → Dashboard Icons
- **Do not** move the "← Back to options" button to the top of a `SectionCard` — it must be at the **bottom**
- **Do not** manually edit `docs/admin/index.html` — it is regenerated by `scripts/post-build.mjs` on every build
- **Do not** add a tab bar for super admin in `Admin.jsx` — super admin sees all content directly without tabs
- **Do not** add `orgadmins` as a tab for super admin — org admin profiles are shown inline in each org row

---

## Making the app public — App Store deployment

### Current deployment (web)
The app is a static SPA served from GitHub Pages:
- Production URL: `https://mtt999.github.io/ilab/`
- Admin URL: `https://mtt999.github.io/ilab/admin`
- All routing is handled client-side (SPA) — only `docs/index.html` and `docs/admin/index.html` are physical HTML files

### iOS App Store — recommended path: Capacitor

[Capacitor](https://capacitorjs.com/) by Ionic wraps the existing React web app in a native iOS WebView shell. This is the lowest-effort path to the App Store since no rewrite is needed.

**Steps to add Capacitor:**
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios
npx cap init "iLab" "com.yourcompany.ilab" --web-dir docs
npx cap add ios
npm run build
npx cap sync
npx cap open ios   # opens Xcode
```

**Key Capacitor config changes needed in `capacitor.config.ts`:**
- `webDir: 'docs'` — points to the Vite build output
- `server.url` — can point to the live GitHub Pages URL during development for hot reload

**Vite base path issue:** The app uses `base: '/ilab/'` in vite.config.js. For Capacitor (file:// serving), change base to `'/'` for the mobile build, OR configure Capacitor's `server.hostname` appropriately. Use a separate build script or env variable to toggle between web (`/ilab/`) and mobile (`/`) base paths.

**Native APIs to add via Capacitor plugins:**
| Need | Plugin |
|------|--------|
| Camera / QR scan | `@capacitor/camera` or `@capacitor-community/barcode-scanner` |
| Push notifications | `@capacitor/push-notifications` |
| Haptics | `@capacitor/haptics` |
| Status bar | `@capacitor/status-bar` |
| Safe area insets | Already handled via `env(safe-area-inset-*)` CSS in Layout.jsx |

**App Store requirements checklist:**
- [ ] Apple Developer account ($99/year) at developer.apple.com
- [ ] App ID / Bundle ID registered (e.g. `com.yourcompany.ilab`)
- [ ] App icons: 1024×1024 PNG (no alpha), plus all required sizes (Xcode generates from single source via AppIcon)
- [ ] Launch screen / splash screen
- [ ] Privacy policy URL (required if app collects any user data)
- [ ] App Store Connect listing: description, screenshots (6.5" iPhone, 5.5" iPhone, iPad if universal)
- [ ] Xcode signing: Automatically managed signing with your Apple Developer account
- [ ] Build and archive in Xcode → submit via Xcode or Transporter

**iOS-specific issues to watch for:**
- `localStorage` works inside WKWebView (Capacitor uses WKWebView) ✓
- Supabase fetch calls work in WKWebView ✓
- The `base: '/ilab/'` path must be changed to `'/'` for local file serving
- Safe area insets are already handled in Layout.jsx (`env(safe-area-inset-top)`)
- Camera permission: add `NSCameraUsageDescription` to `ios/App/App/Info.plist`

### Android (Google Play) — same Capacitor approach
```bash
npm install @capacitor/android
npx cap add android
npx cap open android   # opens Android Studio
```

### Alternative: PWA (Progressive Web App)
Add a `manifest.json` and service worker to make the web app installable on iOS home screen without App Store review. Simpler but limited native API access and not listed in App Store.
