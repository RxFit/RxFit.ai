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
        <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(45,212,191,0.1),rgba(251,146,60,0.1));border:1px solid rgba(45,212,191,0.2);border-radius:16px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:30px;">
              <h1 style="color:#2DD4BF;font-size:28px;margin:0;">RxFit<span style="color:#FB923C;">.ai</span></h1>
            </td>
          </tr>
          <tr>
            <td>
              <h2 style="color:#F8FAFC;font-size:24px;margin:0 0 20px;">Welcome to RxFit.ai, ${firstName}!</h2>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 20px;">
                You've just taken the first step toward transforming your health with the <strong style="color:#2DD4BF;">${safePlanName}</strong> plan. We're excited to have you on board.
              </p>
              <h3 style="color:#F8FAFC;font-size:18px;margin:0 0 15px;">Here's what happens next:</h3>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#2DD4BF;font-size:20px;">1.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Connect your wearables</strong> — Sync your Apple Watch, Fitbit, Garmin, or other devices to your AI Health Hub.</td>
                </tr>
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#2DD4BF;font-size:20px;">2.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Meet your coach</strong> — Your personal trainer will reach out within 24 hours to schedule your first session.</td>
                </tr>
                <tr>
                  <td style="padding:8px 15px 8px 0;vertical-align:top;color:#2DD4BF;font-size:20px;">3.</td>
                  <td style="padding:8px 0;color:#CBD5E1;font-size:15px;line-height:1.5;"><strong style="color:#F8FAFC;">Set your goals</strong> — Complete your health profile so our AI can start personalizing your experience.</td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:30px auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#2DD4BF,#14B8A6);border-radius:12px;padding:16px 40px;">
                    <a href="https://app.rxfit.ai" style="color:#0F172A;text-decoration:none;font-size:16px;font-weight:700;">Get Started Now</a>
                  </td>
                </tr>
              </table>
              <p style="color:#94A3B8;font-size:14px;line-height:1.5;margin:25px 0 0;border-top:1px solid rgba(148,163,184,0.2);padding-top:20px;">
                Questions? Just reply to this email — we're here to help.<br>
                <span style="color:#FB923C;">— The RxFit.ai Team</span>
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
        <table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(45,212,191,0.1),rgba(251,146,60,0.1));border:1px solid rgba(45,212,191,0.2);border-radius:16px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:30px;">
              <h1 style="color:#2DD4BF;font-size:28px;margin:0;">RxFit<span style="color:#FB923C;">.ai</span></h1>
            </td>
          </tr>
          <tr>
            <td>
              <h2 style="color:#F8FAFC;font-size:24px;margin:0 0 20px;">Hey ${firstName}, you're on the list!</h2>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Thanks for your interest in RxFit.ai. We're building the future of personal fitness — combining <span style="color:#2DD4BF;">AI-powered health insights</span> with <span style="color:#FB923C;">real human coaching</span>.
              </p>
              <p style="color:#CBD5E1;font-size:16px;line-height:1.6;margin:0 0 25px;">
                We'll keep you updated on our launch and send you exclusive early-access offers.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:25px auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#2DD4BF,#14B8A6);border-radius:12px;padding:16px 40px;">
                    <a href="https://rxfit.ai/#pricing" style="color:#0F172A;text-decoration:none;font-size:16px;font-weight:700;">View Our Plans</a>
                  </td>
                </tr>
              </table>
              <p style="color:#94A3B8;font-size:14px;line-height:1.5;margin:25px 0 0;border-top:1px solid rgba(148,163,184,0.2);padding-top:20px;">
                <span style="color:#FB923C;">— The RxFit.ai Team</span>
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

export async function sendWelcomeEmail(email: string, name: string, planName: string): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    const html = getWelcomeEmailHtml(name, planName);
    const raw = createMimeMessage(email, `Welcome to RxFit.ai — Let's Get Started!`, html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
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

/** Notify the owner that an auto-publish run failed. Best-effort (never throws). */
export async function sendPostFailureEmail(stage: string, error: unknown): Promise<void> {
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
  } catch (notifyError) {
    console.error('[blog-publisher] Could not send failure notification email:', notifyError);
  }
}

/** Notify the owner that Stripe or Gmail credentials stopped resolving. Best-effort (never throws). */
export async function sendCredentialAlertEmail(service: string, error: unknown): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    const to = await getOwnerEmail();
    const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
    const serviceLabel = service === 'stripe' ? 'Stripe' : service === 'gmail' ? 'Gmail' : service;
    const impact =
      service === 'stripe'
        ? 'Checkout and pricing on rxfit.ai will fail (500s) until this is fixed.'
        : 'Welcome/lead emails and blog notifications will fail until this is fixed.';
    const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0F172A;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F172A;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(239,68,68,0.4);border-radius:16px;padding:40px;">
        <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#EF4444;font-size:24px;margin:0;">RxFit.ai Credential Monitor</h1></td></tr>
        <tr><td>
          <h2 style="color:#F8FAFC;font-size:20px;margin:0 0 16px;">${escapeHtml(serviceLabel)} credentials are BROKEN</h2>
          <p style="color:#CBD5E1;font-size:15px;line-height:1.6;margin:0 0 12px;">The hourly health check could not resolve ${escapeHtml(serviceLabel)} credentials (checked twice). ${escapeHtml(impact)}</p>
          <pre style="color:#FCA5A5;background:rgba(239,68,68,0.08);border-radius:8px;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message.slice(0, 4000))}</pre>
          <p style="color:#64748B;font-size:13px;margin:16px 0 0;">Fix: open the Replit workspace → Integrations and re-authorize the ${escapeHtml(serviceLabel)} connection. You'll only get this email once per outage; recovery is logged automatically.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    const raw = createMimeMessage(to, `🚨 RxFit.ai: ${serviceLabel} credentials are broken`, html);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[credential-check] Alert email sent to ${to} for ${service}`);
  } catch (notifyError) {
    console.error(`[credential-check] Could not send credential alert email for ${service}:`, notifyError);
  }
}

export async function sendLeadEmail(email: string, name: string): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    const html = getLeadWelcomeEmailHtml(name);
    const raw = createMimeMessage(email, `You're on the RxFit.ai list!`, html);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    console.log(`Lead welcome email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send lead email:', error);
  }
}
