// @ts-nocheck — Deno, not Node. (See s3-presign/index.ts for why.)
//
// create-lab-users — Lab Management → Import lab users (LabHive, Oct 2026 — the same file as ICT-Lab's except the users insert).
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// name it "create-lab-users", paste this file, Deploy. No secrets to add:
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected.
//
// Why a function: the app creates one login at a time with auth.signUp() from
// the browser, which Supabase rate-limits per IP — an import of 50 people
// would fail part-way. Here the service role creates them with no limit and
// no confirmation email (the welcome email is ours, queued by the app).
//
// Actions (POST JSON, signed in as an org admin or lab manager of orgId):
//   check  { orgId, emails[] }   → { existing[] }  emails that already have an account
//   create { orgId, users[] }    → { batchId, created[], failed[] }   max 50
//            users[i] = { first, last, email, supervisor, password,
//                         required_safety_steps, annual_resafety }
//   reset  { orgId, userId, password } → { ok }    new temporary password for
//            someone who has not signed in yet; their older unsent welcome
//            email is retired so only the new password goes out.
//   email  { orgId, userId, email } → { ok }       correct the email (login and
//            account) of someone who has not signed in yet (Edit list); their
//            unsent welcome email is retired — the app sends a new one.
//   demo   { orgId, requestId, password } → { ok, userId, email, reused }
//            SUPER ADMIN ONLY (Nov 2026, "Request a demo"). A login + lab
//            manager account in the Demo Lab (orgId) for a demo request; the
//            app emails the login. The same email asked before → that demo
//            account is reopened with the new password. An email that belongs
//            to a real account is refused. See demo_requests_setup.sql.
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX = 50
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body, status = 200) => Response.json(body, { status, headers: CORS })
const okEmail = e => typeof e === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e)
const clean = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

// The caller's users row in orgId if they manage it, or a stub for the super admin.
async function caller(req, orgId) {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const asUser = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data, error } = await asUser.auth.getUser()
  const uid = data?.user?.id
  if (error || !uid) return null
  const { data: rows } = await admin.from('users').select('id, name, last_name, role')
    .eq('auth_id', uid).eq('organization_id', orgId).eq('is_active', true).in('role', ['admin', 'user'])
  if (rows?.length) return rows.find(r => r.role === 'admin') ?? rows[0]
  const { data: s } = await admin.from('settings').select('value').eq('key', 'super_admin_auth_id').maybeSingle()
  if (s && String(s.value ?? '').replace(/^"|"$/g, '') === uid) return { id: null, name: 'Super admin', role: 'admin' }
  return null
}

// Emails (lower-case) that already belong to a users row, in any organization.
async function existingEmails(emails) {
  const want = [...new Set(emails.map(e => e.toLowerCase()))]
  if (!want.length) return []
  const found = new Set()
  for (let i = 0; i < want.length; i += 25) {
    const part = want.slice(i, i + 25)
    // ilike so "A.Smith@" matches "a.smith@"; its wildcards (_ %) could
    // over-match, so the exact comparison below decides.
    const { data, error } = await admin.from('users').select('email').or(part.map(e => `email.ilike.${e}`).join(','))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) if (r.email) found.add(r.email.toLowerCase())
  }
  return want.filter(e => found.has(e))
}

// A login with this email that no account uses (left behind by a deleted
// user). Returns its id so it can be removed and created fresh.
async function orphanLogin(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const hit = data.users.find(u => (u.email ?? '').toLowerCase() === email)
    if (hit) {
      const { count } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('auth_id', hit.id)
      return count ? null : hit.id
    }
    if (data.users.length < 1000) return null
  }
  return null
}

async function createLogin(email, password) {
  let res = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (res.error && /already|registered|exists/i.test(res.error.message)) {
    const orphan = await orphanLogin(email)
    if (!orphan) throw new Error('This email already has a login')
    await admin.auth.admin.deleteUser(orphan)
    res = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  }
  if (res.error) throw new Error(res.error.message)
  return res.data.user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json()
    const { action, orgId } = body ?? {}
    if (!orgId) return json({ error: 'orgId required' }, 400)
    const me = await caller(req, orgId)
    if (!me) return json({ error: 'Only an org admin or lab manager of this organization can do this' }, 403)

    if (action === 'check') {
      const emails = (body.emails ?? []).filter(okEmail).slice(0, MAX)
      return json({ existing: await existingEmails(emails) })
    }

    if (action === 'create') {
      const list = (body.users ?? [])
      if (!list.length) return json({ error: 'No lab users to add' }, 400)
      if (list.length > MAX) return json({ error: `At most ${MAX} lab users per import` }, 400)
      const emails = list.map(u => String(u.email ?? '').trim().toLowerCase())
      if (emails.some(e => !okEmail(e))) return json({ error: 'Every row needs a valid email' }, 400)
      if (new Set(emails).size !== emails.length) return json({ error: 'The same email appears twice in the list' }, 400)
      const taken = await existingEmails(emails)
      if (taken.length) return json({ error: 'Already have an account: ' + taken.join(', '), existing: taken }, 409)

      const { data: batch, error: bErr } = await admin.from('lab_user_imports').insert({
        organization_id: orgId, created_by: me.id,
        created_by_name: [me.name, me.last_name].filter(Boolean).join(' ') || 'Lab manager',
        user_count: 0,
      }).select('id').single()
      if (bErr) return json({ error: 'Could not start the import: ' + bErr.message }, 500)

      const created = [], failed = []
      for (let i = 0; i < list.length; i++) {
        const u = list[i], email = emails[i]
        const steps = Array.isArray(u.required_safety_steps) ? u.required_safety_steps.map(Number) : null
        let authId = null
        try {
          if (typeof u.password !== 'string' || u.password.length < 8) throw new Error('missing temporary password')
          authId = await createLogin(email, u.password)
          const { data: row, error } = await admin.from('users').insert({
            name: clean(u.first, 60), last_name: clean(u.last, 60), email,
            supervisor: clean(u.supervisor, 120),
            role: 'lab_user', organization_id: orgId, is_active: true, admin_level: 0, pin: '',
            must_change_password: true, terms_accepted_version: null, auth_id: authId,
            required_safety_steps: steps, annual_resafety: u.annual_resafety !== false,
            // No safety_self_approve here: in LabHive a lab manager approves
            // every safety step, imported or not.
            import_batch_id: batch.id,
          }).select('id').single()
          if (error) throw new Error(error.message)
          created.push({ email, id: row.id })
        } catch (e) {
          // Never leave a login with no account behind it.
          if (authId) await admin.auth.admin.deleteUser(authId).catch(() => {})
          failed.push({ email, error: String(e?.message ?? e).slice(0, 200) })
        }
      }
      await admin.from('lab_user_imports').update({ user_count: created.length }).eq('id', batch.id)
      if (!created.length) await admin.from('lab_user_imports').delete().eq('id', batch.id)
      return json({ batchId: created.length ? batch.id : null, created, failed })
    }

    if (action === 'reset') {
      const { userId, password } = body
      if (typeof password !== 'string' || password.length < 8) return json({ error: 'password required' }, 400)
      const { data: u } = await admin.from('users').select('id, auth_id, role, organization_id, password_set_at, must_change_password')
        .eq('id', userId).maybeSingle()
      if (!u || u.organization_id !== orgId || u.role !== 'lab_user') return json({ error: 'Lab user not found in this organization' }, 404)
      if (u.password_set_at || !u.must_change_password) return json({ error: 'They have already chosen their own password' }, 409)
      if (!u.auth_id) return json({ error: 'This lab user has no login' }, 409)
      const { error } = await admin.auth.admin.updateUserById(String(u.auth_id), { password })
      if (error) return json({ error: error.message }, 500)
      await admin.from('email_notifications_queue')
        .update({ attempts: 99, error: 'Replaced by a newer welcome email' })
        .eq('user_id', u.id).eq('type', 'welcome').eq('sent', false)
      return json({ ok: true })
    }

    if (action === 'email') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!okEmail(email)) return json({ error: 'Not a valid email' }, 400)
      const { data: u } = await admin.from('users').select('id, auth_id, email, role, organization_id, password_set_at, must_change_password')
        .eq('id', body.userId).maybeSingle()
      if (!u || u.organization_id !== orgId || u.role !== 'lab_user') return json({ error: 'Lab user not found in this organization' }, 404)
      if (u.password_set_at || !u.must_change_password) return json({ error: 'They have already signed in — the email can no longer be changed here' }, 409)
      if ((u.email ?? '').toLowerCase() === email) return json({ ok: true })
      if ((await existingEmails([email])).length) return json({ error: 'That email already has an account' }, 409)
      if (u.auth_id) {
        const { error } = await admin.auth.admin.updateUserById(String(u.auth_id), { email, email_confirm: true })
        if (error) return json({ error: error.message }, 500)
      }
      const { error: uErr } = await admin.from('users').update({ email }).eq('id', u.id)
      if (uErr) return json({ error: uErr.message }, 500)
      await admin.from('email_notifications_queue')
        .update({ attempts: 99, error: 'Email address changed' })
        .eq('user_id', u.id).eq('type', 'welcome').eq('sent', false)
      return json({ ok: true })
    }

    if (action === 'demo') {
      if (me.id !== null) return json({ error: 'Only the super admin can send demo access' }, 403)
      const { requestId, password } = body
      if (typeof password !== 'string' || password.length < 8) return json({ error: 'password required' }, 400)
      const { data: r } = await admin.from('demo_requests').select('*').eq('id', requestId).maybeSingle()
      if (!r) return json({ error: 'Demo request not found' }, 404)
      if (r.status === 'sent' && r.user_id) return json({ error: 'Demo access was already sent for this request' }, 409)
      const email = String(r.email ?? '').trim().toLowerCase()
      if (!okEmail(email)) return json({ error: 'The request has no valid email' }, 400)

      // Any account already using this email
      const { data: rows, error: lErr } = await admin.from('users')
        .select('id, auth_id, email, organization_id, demo_request_id').ilike('email', email)
      if (lErr) return json({ error: lErr.message }, 500)
      const same = (rows ?? []).filter(x => (x.email ?? '').toLowerCase() === email)
      const demoRow = same.find(x => x.organization_id === orgId && x.demo_request_id)
      if (same.length && !demoRow) return json({ error: 'This email already has a LabHive account, so no demo login was created' }, 409)

      let userId, reused = false
      if (demoRow) {
        // Asked for a demo again: reopen their demo account with the new password
        if (demoRow.auth_id) {
          const { error } = await admin.auth.admin.updateUserById(String(demoRow.auth_id), { password })
          if (error) return json({ error: error.message }, 500)
        } else {
          const authId = await createLogin(email, password)
          await admin.from('users').update({ auth_id: authId }).eq('id', demoRow.id)
        }
        const { error } = await admin.from('users').update({
          is_active: true, demo_request_id: r.id, must_change_password: false,
          name: clean(r.first_name, 60), last_name: clean(r.last_name, 60),
        }).eq('id', demoRow.id)
        if (error) return json({ error: error.message }, 500)
        userId = demoRow.id
        reused = true
      } else {
        const authId = await createLogin(email, password)
        const { data: row, error } = await admin.from('users').insert({
          name: clean(r.first_name, 60), last_name: clean(r.last_name, 60), email,
          // Lab manager: sees nearly every feature. The app applies the
          // public-demo locks to demo visitors (no admin panel, no password change).
          role: 'user', organization_id: orgId, is_active: true, admin_level: 0, pin: '',
          must_change_password: false, terms_accepted_version: null, auth_id: authId,
          demo_request_id: r.id,
        }).select('id').single()
        if (error) {
          await admin.auth.admin.deleteUser(authId).catch(() => {})
          return json({ error: error.message }, 500)
        }
        userId = row.id
      }
      // The 15 days start at their first sign-in (demo_access_check)
      const { error: uErr } = await admin.from('demo_requests').update({
        status: 'sent', sent_at: new Date().toISOString(), user_id: userId,
        first_login_at: null, expires_at: null, ended_at: null,
      }).eq('id', r.id)
      if (uErr) return json({ error: uErr.message }, 500)
      return json({ ok: true, userId, email, reused })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})
