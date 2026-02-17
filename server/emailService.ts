import { getUncachableGmailClient } from './gmailClient';

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
  const firstName = name ? name.split(' ')[0] : 'there';
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
                You've just taken the first step toward transforming your health with the <strong style="color:#2DD4BF;">${planName}</strong> plan. We're excited to have you on board.
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
  const firstName = name ? name.split(' ')[0] : 'there';
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
