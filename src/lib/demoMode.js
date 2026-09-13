// Demo restrictions apply to the PUBLIC demo, not to the demo account itself.
//
// `demo` / `demo` on the login form is a public shortcut that resolves to the
// real account demo@labhive.app (see Login.jsx). Anyone can use it, so those
// sessions are locked down: no admin panel, no destructive actions.
//
// The owner signs in as demo@labhive.app with its REAL password. Same rows,
// same org — but a genuine secret was supplied, so no restrictions apply and
// the admin identity is available. Deriving the flag from the email alone
// (the old behaviour) could not tell these two apart and restricted both.
//
// The flag is written at sign-in and read again on session restore, so a hard
// refresh doesn't silently re-lock an unlocked session.
const KEY = 'ilab_demo_public'

/** Call at sign-in: true when the public demo/demo shortcut was used. */
export function setPublicDemo(isPublicShortcut) {
  try {
    if (isPublicShortcut) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* private mode — fall through to unrestricted */ }
}

/** True only for a demo account entered through the public shortcut. */
export function isPublicDemo(email) {
  if (email?.toLowerCase() !== 'demo@labhive.app') return false
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function clearPublicDemo() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
