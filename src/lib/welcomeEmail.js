import { buildEmailHtml } from './emailTemplate.js'

// `sendAfter`: an ISO time — the email waits in the queue until then
// (Import lab users → "send later"). `required`: the safety steps this person
// must do (null = all); [0] / none = no safety training. Returns the error.
export async function queueWelcomeEmail(sb, { name, toEmail, orgId, userId = null, password = null, sendAfter = null, required = null }) {
  if (!toEmail) return null
  let orgContact = null
  let orgName = 'your organization'
  if (orgId) {
    const { data: org } = await sb.from('organizations').select('name, contact_name, contact_email').eq('id', orgId).maybeSingle()
    if (org) { orgName = org.name || orgName; orgContact = org }
  }
  const subject = 'Your LabHive account is ready'
  const title = `Welcome to LabHive, ${name}!`
  const noSteps = Array.isArray(required) && !required.some(n => Number(n) > 0)
  const safetyLine = noSteps
    ? ' No safety training is required for your account.'
    : ' After that, complete the safety steps under Training Records → Safety; a lab manager approves each one, and the website opens fully once they are approved.'
  const body = `Your account has been created for ${orgName}. Use the credentials below to sign in. You will be prompted to set a new password on your first login.${safetyLine}`
  const htmlBody = buildEmailHtml({
    title,
    body,
    ctaLabel: 'Sign in to LabHive →',
    ctaUrl: 'https://labhive.app/app',
    prefsUrl: 'https://labhive.app/app?screen=profile',
    orgContact,
    credentials: password ? { email: toEmail, password } : null,
  })
  const row = { to_email: toEmail, subject, body, html_body: htmlBody, user_id: userId, type: 'welcome' }
  if (sendAfter) row.send_after = sendAfter
  const { error } = await sb.from('email_notifications_queue').insert(row)
  if (error) console.warn('Welcome email queue failed:', error.message)
  return error || null
}
