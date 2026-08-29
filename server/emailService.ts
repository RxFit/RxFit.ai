import { getUncachableGmailClient } from './gmailClient';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function createMimeMessage(to: string, subject: string, htmlBody: string): string {
  const boundary = 'boundary_' + Date.now();
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

function getWelcomeEmailHtml(name: string, planName: string): string {
  const firstName = escapeHtml(name ? name.split(' ')[0] : 'there');
  const safePlanName = escapeHtml(planName);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.03));border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:30px;">
              <h1 style="color:#D4AF37;font-size:28px;margin:0;">RxFit<span style="color:#F8FAFC;">.ai</span></h1>
            </td>
          </tr>
          <tr>
            <td>
              <h2 style="color:#F8FAFC;font-size:24px;margin:0 0 20px;">Welcome to RxFit.ai, ${firstName}!</h2>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 20px;">
                You've just taken the first step toward transforming your health with the <strong style="color:#D4AF37;">${safePlanName}</strong> plan. We're excited to have you on board.
              </p>
              <h3 style="color:#F8FAFC;font-size:18px;margin:0 0 15px;">Here's what happens next:</h3>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#D4AF37;font-size:20px;">1.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Connect your wearables</strong> — Sync your Apple Watch, Fitbit, Garmin, or other devices to your AI Health Hub.</td>
                </tr>
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#D4AF37;font-size:20px;">2.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Meet your coach</strong> — Your personal trainer will reach out within 24 hours to schedule your first session.</td>
                </tr>
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#D4AF37;font-size:20px;">3.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Set your goals</strong> — Complete your health profile so our AI can start personalizing your experience.</td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:30px auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#D4AF37,#B8942C);border-radius:12px;padding:16px 40px;">
                    <a href="https://app.rxfit.ai" style="color:#0F172A;text-decoration:none;font-size:16px;font-weight:700;">Get Started Now</a>
                  </td>
                </tr>
              </table>
              <p style="color:#94A3B8;font-size:14px;line-height:1.5;margin:25px 0 0;border-top:1px solid rgba(148,163,184,0.2);padding-top:20px;">
                Questions? Just reply to this email — we're here to help.<br>
                <span style="color:#D4AF37;">— The RxFit.ai Team</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getLeadWelcomeEmailHtml(name: string): string {
  const firstName = escapeHtml(name ? name.split(' ')[0] : 'there');
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.03));border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:30px;">
              <h1 style="color:#D4AF37;font-size:28px;margin:0;">RxFit<span style="color:#F8FAFC;">.ai</span></h1>
            </td>
          </tr>
          <tr>
            <td>
              <h2 style="color:#F8FAFC;font-size:24px;margin:0 0 20px;">Hey ${firstName}, you're on the list!</h2>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Thanks for your interest in RxFit.ai. We're building the future of personal fitness — combining <span style="color:#D4AF37;">AI-powered health insights</span> with <span style="color:#E6C55C;">real human coaching</span>.
              </p>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 25px;">
                We'll keep you updated on our launch and send you exclusive early-access offers.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:25px auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#D4AF37,#B8942C);border-radius:12px;padding:16px 40px;">
                    <a href="https://rxfit.ai/#pricing" style="color:#0F172A;text-decoration:none;font-size:16px;font-weight:700;">View Our Plans</a>
                  </td>
                </tr>
              </table>
              <p style="color:#94A3B8;font-size:14px;line-height:1.5;margin:25px 0 0;border-top:1px solid rgba(148,163,184,0.2);padding-top:20px;">
                <span style="color:#D4AF37;">— The RxFit.ai Team</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Record a failed customer-facing email in the "RxFit Alerts" sheet tab so
 * the owner can re-send it manually. Best-effort: if the sheet write also
 * fails, log loudly — the customer flow must never break over notifications.
 */
async function recordCustomerEmailFailure(
  kind: 'welcome' | 'lead',
  recipient: string,
  name: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const { appendAlertToSheet } = await import('./sheetsService');
    await appendAlertToSheet({
      title: `${kind === 'welcome' ? 'Welcome' : 'Lead nurture'} email FAILED to send — re-send manually to ${recipient}`,
      message: `Recipient: ${recipient}${name ? ` (${name})` : ''}\nError: ${message}`,
    });
    console.log(`[email] Failure recorded in Google Sheet for ${kind} email to ${recipient}`);
  } catch (sheetError) {
    console.error(
      `[email] ${kind} email to ${recipient} failed AND the failure could not be recorded in the sheet — this send is untracked:`,
      sheetError,
    );
  }
}

/**
 * Send the branded welcome email, throwing on failure. Used by the resend CLI
 * (server/resend-email.ts), which needs a loud failure instead of the
 * record-and-continue behavior of sendWelcomeEmail.
 */
export async function sendWelcomeEmailOrThrow(email: string, name: string, planName: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  const html = getWelcomeEmailHtml(name, planName);
  const raw = createMimeMessage(email, `Welcome to RxFit.ai — Let's Get Started!`, html);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  console.log(`Welcome email sent to ${email}`);
}

export async function sendWelcomeEmail(email: string, name: string, planName: string): Promise<void> {
  try {
    await sendWelcomeEmailOrThrow(email, name, planName);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    await recordCustomerEmailFailure('welcome', email, name, error);
  }
}

/**
 * Resolve the site owner's notification address.
 * Primary source: OWNER_NOTIFICATION_EMAIL env var (set explicitly; no connector dependency).
 * Fallbacks: Gmail getProfile (needs a profile-capable scope), then the Google
 * account behind the Sheets connection (same owner) via Drive "about".
 */
async function getOwnerEmail(): Promise<string> {
  if (process.env.OWNER_NOTIFICATION_EMAIL) {
    return process.env.OWNER_NOTIFICATION_EMAIL;
  }
  try {
    const gmail = await getUncachableGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const address = profile.data.emailAddress;
    if (address) return address;
  } catch {
    // The Gmail connection may lack the scope for getProfile (send-only token).
    // Fall back to the Google account behind the Sheets connection (same owner).
  }
  const { getConnectionSettings } = await import('./connectorSettings');
  const sheets = await getConnectionSettings('google-sheet');
  const token = sheets?.settings?.access_token || sheets?.settings?.oauth?.credentials?.access_token;
  if (token) {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      const address = data?.user?.emailAddress;
      if (address) return address;
    }
  }
  throw new Error('Could not resolve owner email (set OWNER_NOTIFICATION_EMAIL to override)');
}

/** Notify the owner that the auto-publisher shipped a new blog post. Throws on failure. */
export async function sendPostPublishedEmail(post: {
  title: string;
  slug: string;
  keywordTheme: string;
  pillar: string;
  readingMinutes: number;
}): Promise<void> {
  const gmail = await getUncachableGmailClient();
  const to = await getOwnerEmail();
  const url = `https://rxfit.ai/blog/${post.slug}`;
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#D4AF37;font-size:24px;margin:0;">RxFit.ai Auto-Publisher</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 16px;">New blog post published</h2>
          <p style="color:#CBD5E1;font-size:15px;line-height:1.6;margin:0 0 8px;"><strong style="color:#F8FAFC;">${escapeHtml(post.title)}</strong></p>
          <p style="color:#94A3B8;font-size:14px;margin:0 0 4px;">Theme: ${escapeHtml(post.keywordTheme)} &middot; Pillar: ${escapeHtml(post.pillar)} &middot; ${post.readingMinutes} min read</p>
          <p style="color:#94A3B8;font-size:14px;margin:0 0 24px;"><a href="${url}" style="color:#D4AF37;">${url}</a></p>
          <p style="color:#64748B;font-size:13px;margin:0;">This post is live now — no redeploy needed. It appears on /blog and in sitemap.xml automatically.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const raw = createMimeMessage(to, `✅ New RxFit.ai blog post live: ${post.title}`, html);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  console.log(`[blog-publisher] Publish notification sent to ${to}`);
}

/**
 * Notify the owner that an auto-publish run failed. Best-effort (never throws).
 * Returns true when the email was actually sent, false when sending failed —
 * callers can use this to fall back to a second alert channel (e.g. the
 * Google Sheet) when Gmail itself is down.
 */
export async function sendPostFailureEmail(stage: string, error: unknown): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    const to = await getOwnerEmail();
    const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
    const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(239,68,68,0.4);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#EF4444;font-size:24px;margin:0;">RxFit.ai Auto-Publisher</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 16px;">Blog auto-publish FAILED</h2>
          <p style="color:#CBD5E1;font-size:15px;line-height:1.6;margin:0 0 12px;">Stage: <strong style="color:#F8FAFC;">${escapeHtml(stage)}</strong></p>
          <pre style="color:#FCA5A5;background:rgba(239,68,68,0.08);border-radius:8px;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message.slice(0, 4000))}</pre>
          <p style="color:#64748B;font-size:13px;margin:16px 0 0;">No post was published in this run. The next scheduled run will retry automatically.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    const raw = createMimeMessage(to, `❌ RxFit.ai blog auto-publish failed (${stage})`, html);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[blog-publisher] Failure notification sent to ${to}`);
    return true;
  } catch (notifyError) {
    console.error('[blog-publisher] Could not send failure notification email:', notifyError);
    return false;
  }
}

/**
 * Notify the owner that an existing post was refreshed by the SEO feedback loop.
 * Best-effort (never throws). Returns true when the email was actually sent,
 * false when sending failed — callers can use this to fall back to a second
 * alert channel (e.g. the Google Sheet) when Gmail itself is down.
 */
export async function sendPostRefreshedEmail(
  post: { title: string; slug: string; refreshCount: number },
  reason: string,
  queries: string[],
): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    const to = await getOwnerEmail();
    const url = `https://rxfit.ai/blog/${post.slug}`;
    const queryLine =
      queries.length > 0
        ? `<p style="color:#94A3B8;font-size:14px;margin:0 0 4px;">Target queries: ${escapeHtml(queries.slice(0, 5).join(', '))}</p>`
        : '';
    const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#D4AF37;font-size:24px;margin:0;">RxFit.ai SEO Feedback Loop</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 16px;">Blog post refreshed</h2>
          <p style="color:#CBD5E1;font-size:15px;line-height:1.6;margin:0 0 8px;"><strong style="color:#F8FAFC;">${escapeHtml(post.title)}</strong></p>
          <p style="color:#94A3B8;font-size:14px;margin:0 0 4px;">Reason: ${escapeHtml(reason)} &middot; Refresh #${post.refreshCount}</p>
          ${queryLine}
          <p style="color:#94A3B8;font-size:14px;margin:0 0 24px;"><a href="${url}" style="color:#D4AF37;">${url}</a></p>
          <p style="color:#64748B;font-size:13px;margin:0;">The URL is unchanged; the updated content and "Updated" date are live now.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    const raw = createMimeMessage(to, `🔄 RxFit.ai post refreshed: ${post.title}`, html);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[blog-refresher] Refresh notification sent to ${to}`);
    return true;
  } catch (notifyError) {
    console.error('[blog-refresher] Could not send refresh notification email:', notifyError);
    return false;
  }
}

/**
 * How a credential alert should be explained to the owner.
 *
 * Classified by the ERROR, not the service name: a missing secret, a rejected
 * key and a drifted price all arrive as "stripe" but need different remedies.
 * The production incident sent a "re-authorize the connection in Integrations"
 * instruction for an error whose own text said to set STRIPE_SECRET_KEY — and
 * following it would have resolved the sandbox connection, turning the monitor
 * green while live checkout stayed broken.
 */
export type CredentialAlertKind =
  | "stripe-missing-secret"
  | "stripe-test-key"
  | "stripe-rejected-key"
  | "stripe-catalog-mismatch"
  | "connector";

/** Pure. Order matters: the catalog and test-key messages also say "Stripe". */
export function classifyCredentialAlert(service: string, message: string): CredentialAlertKind {
  if (service === 'stripe') {
    if (/no longer matches the site's advertised pricing/i.test(message)) return 'stripe-catalog-mismatch';
    if (/TEST-mode keys|livemode=false/i.test(message)) return 'stripe-test-key';
    if (/Set STRIPE_SECRET_KEY|No Stripe credentials found|connection not found via Connector|resolved empty/i.test(message)) return 'stripe-missing-secret';
    if (/Invalid API Key|No API key provided|\b401\b/i.test(message)) return 'stripe-rejected-key';
  }
  return 'connector';
}

/** Pure. Headline (also used in the subject), impact and remedy copy. */
export function credentialAlertCopy(
  service: string,
  serviceLabel: string,
  kind: CredentialAlertKind,
): { headline: string; impact: string; remedy: string } {
  const checkoutImpact = 'Checkout and pricing on rxfit.ai will fail (500s) until this is fixed.';

  switch (kind) {
    case 'stripe-missing-secret':
      return {
        headline: 'Set STRIPE_SECRET_KEY in Replit → Secrets',
        impact: checkoutImpact,
        remedy:
          'Open the Replit workspace → Secrets for the PRODUCTION deployment and set STRIPE_SECRET_KEY to the LIVE secret key (sk_live_…) for the Stripe account that owns the site\'s pinned price IDs, then redeploy. Re-authorizing the Stripe connection under Integrations is NOT the fix here — that path resolves the sandbox/test connection, which would make this alert go green while live checkout keeps 500ing. Confirm recovery at /api/internal/credential-health instead of waiting for the next hourly sweep.',
      };
    case 'stripe-test-key':
      return {
        headline: 'A TEST-mode Stripe key is serving the live site',
        impact: checkoutImpact,
        remedy:
          'Replace STRIPE_SECRET_KEY in Replit → Secrets with the live sk_live_… key and redeploy. Do not dismiss this because the API call succeeded — it succeeded against the TEST account; the site\'s price IDs are livemode and will 404.',
      };
    case 'stripe-rejected-key':
      return {
        headline: 'Stripe rejected the key — rotate it',
        impact: checkoutImpact,
        remedy:
          'The key resolved but Stripe refused it. Rotate it in the Stripe dashboard and update STRIPE_SECRET_KEY in Replit → Secrets. Re-authorizing the connector will not help: a key is being supplied, it is being refused.',
      };
    case 'stripe-catalog-mismatch':
      return {
        headline: 'A pinned Stripe price no longer matches the advertised price',
        impact:
          'The Stripe key works — this is a pricing mismatch. Buyers may be charged an amount the site never displayed, or checkout may fail for the affected tier.',
        remedy:
          'Compare the price(s) named above against PLAN_PRICING / LIVE_PRICE_IDS in shared/stripe-constants.ts and bring them back into agreement — either correct the price in the Stripe dashboard, or update the constants and redeploy so the displayed price and the charged price ship together. Do NOT add metadata.tier to any product: nothing in the site reads product metadata to pick a price.',
      };
    default:
      return {
        headline: 'Re-authorize the connection in Replit → Integrations',
        impact:
          service === 'sheets'
            ? 'Lead rows will silently stop syncing to the spreadsheet AND the backup alert channel is dead until this is fixed.'
            : service === 'stripe'
            ? checkoutImpact
            : 'Welcome/lead emails and blog notifications will fail until this is fixed.',
        remedy: `open the Replit workspace → Integrations and re-authorize the ${serviceLabel} connection.`,
      };
  }
}

/**
 * Notify the owner that Stripe or Gmail credentials stopped resolving.
 * Best-effort (never throws). Returns true when the email was actually sent,
 * false when sending failed — callers can use this to fall back to a second
 * alert channel (e.g. the Google Sheet) when Gmail itself is down.
 */
export async function sendCredentialAlertEmail(service: string, error: unknown): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    const to = await getOwnerEmail();
    const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
    const serviceLabel = service === 'stripe' ? 'Stripe' : service === 'gmail' ? 'Gmail' : service === 'sheets' ? 'Google Sheets' : service;
    const kind = classifyCredentialAlert(service, message);
    const { headline, impact, remedy } = credentialAlertCopy(service, serviceLabel, kind);
    const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(239,68,68,0.4);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#EF4444;font-size:24px;margin:0;">RxFit.ai Credential Monitor</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 16px;">${escapeHtml(serviceLabel)} credentials are BROKEN</h2>
          <p style="color:#CBD5E1;font-size:15px;line-height:1.6;margin:0 0 12px;">The hourly health check FAILED for ${escapeHtml(serviceLabel)} (checked twice). ${escapeHtml(impact)}</p>
          <pre style="color:#FCA5A5;background:rgba(239,68,68,0.08);border-radius:8px;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message.slice(0, 4000))}</pre>
          <p style="color:#64748B;font-size:13px;margin:16px 0 0;">Fix: ${escapeHtml(remedy)} You'll only get this email once per outage; recovery is logged automatically.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    // Append rather than rewrite, so existing mail filters keep matching — and
    // so the phone notification itself names the knob to turn.
    const subject = `🚨 RxFit.ai: ${serviceLabel} credentials are broken — ${headline}`.slice(0, 140);
    const raw = createMimeMessage(to, subject, html);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[credential-check] Alert email sent to ${to} for ${service}`);
    return true;
  } catch (notifyError) {
    console.error(`[credential-check] Could not send credential alert email for ${service}:`, notifyError);
    return false;
  }
}

/**
 * Weekly digest of alert rows that landed in the "RxFit Alerts" sheet tab
 * since the last digest. Throws on failure so the digest scheduler can skip
 * bumping its state and retry hourly — that retry loop is what guarantees
 * sheet-only alerts (written during a Gmail outage) eventually reach the
 * inbox once Gmail recovers.
 */
export async function sendAlertsDigestEmailOrThrow(
  rows: { date: string; title: string; details: string }[],
  since: Date | null,
): Promise<void> {
  const gmail = await getUncachableGmailClient();
  const to = await getOwnerEmail();
  const MAX_ROWS = 50;
  const shown = rows.slice(0, MAX_ROWS);
  const sinceLabel = since
    ? `since the last digest (${since.toISOString().slice(0, 10)})`
    : 'awaiting their first digest';
  const rowsHtml = shown
    .map((row) => {
      const day = row.date ? escapeHtml(row.date.slice(0, 10)) : '—';
      return `
          <tr>
            <td style="padding:10px 12px 10px 0;color:#94A3B8;font-size:12px;vertical-align:top;white-space:nowrap;">${day}</td>
            <td style="padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.15);">
              <p style="color:#F8FAFC;font-size:14px;margin:0 0 4px;font-weight:600;">${escapeHtml(row.title)}</p>
              <p style="color:#94A3B8;font-size:12px;line-height:1.5;margin:0;white-space:pre-wrap;">${escapeHtml(row.details.slice(0, 500))}</p>
            </td>
          </tr>`;
    })
    .join('');
  const overflow =
    rows.length > MAX_ROWS
      ? `<p style="color:#94A3B8;font-size:13px;margin:12px 0 0;">…and ${rows.length - MAX_ROWS} more row(s) — see the "RxFit Alerts" tab in the leads spreadsheet.</p>`
      : '';
  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#D4AF37;font-size:24px;margin:0;">RxFit.ai Alerts Digest</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 8px;">${rows.length} alert row(s) need your attention</h2>
          <p style="color:#CBD5E1;font-size:14px;line-height:1.6;margin:0 0 20px;">These landed in the "RxFit Alerts" sheet tab ${sinceLabel}. They usually mean an email or credential failure was routed to the sheet fallback — review each row and re-send / re-authorize where needed.</p>
          <table cellpadding="0" cellspacing="0" width="100%">${rowsHtml}
          </table>
          ${overflow}
          <p style="color:#64748B;font-size:13px;margin:20px 0 0;border-top:1px solid rgba(148,163,184,0.2);padding-top:16px;">This weekly digest is sent automatically whenever new alert rows exist. Missed customer emails can be re-sent with the resend CLI noted in each row's runbook.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const raw = createMimeMessage(
    to,
    `📋 RxFit.ai weekly alerts digest — ${rows.length} unresolved alert row(s)`,
    html,
  );
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  console.log(`[alerts-digest] Digest email sent to ${to} (${rows.length} row(s))`);
}

/**
 * Send the branded lead nurture email, throwing on failure. Used by the
 * resend CLI (server/resend-email.ts).
 */
export async function sendLeadEmailOrThrow(email: string, name: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  const html = getLeadWelcomeEmailHtml(name);
  const raw = createMimeMessage(email, `You're on the RxFit.ai list!`, html);
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  console.log(`Lead welcome email sent to ${email}`);
}

export async function sendLeadEmail(email: string, name: string): Promise<void> {
  try {
    await sendLeadEmailOrThrow(email, name);
  } catch (error) {
    console.error('Failed to send lead email:', error);
    await recordCustomerEmailFailure('lead', email, name, error);
  }
}
