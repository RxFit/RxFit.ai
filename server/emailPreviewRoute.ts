import type { Request, Response } from "express";
import { isAdminAuthorized } from "./adminAuth";
import { EMAIL_TEMPLATES, SMS_TEMPLATES } from "./emailService";

// Read-only email template previews for the /admin dashboard. Renders every
// registry template with fixed SAMPLE data (never real leads/PII) so the
// owner can eyeball brand/copy changes without triggering a real send.
// Same x-admin-key guard as /api/internal/credential-health.

export const SAMPLE_PROBE = "Sample Preview";

export type EmailPreview = {
  name: string;
  brand: "gold" | "alert";
  html: string;
};

export type SmsPreview = {
  name: string;
  text: string;
};

export function renderAllEmailPreviews(): EmailPreview[] {
  return Object.entries(EMAIL_TEMPLATES).map(([name, tpl]) => ({
    name,
    brand: tpl.brand,
    html: tpl.render(SAMPLE_PROBE),
  }));
}

export function renderAllSmsPreviews(): SmsPreview[] {
  return Object.entries(SMS_TEMPLATES).map(([name, tpl]) => ({
    name,
    text: tpl.render(SAMPLE_PROBE),
  }));
}

export function createEmailPreviewsHandler(
  deps: { renderPreviews: () => EmailPreview[]; renderSmsPreviews?: () => SmsPreview[] } = {
    renderPreviews: renderAllEmailPreviews,
  },
) {
  const renderSms = deps.renderSmsPreviews ?? renderAllSmsPreviews;
  return (req: Request, res: Response) => {
    if (!isAdminAuthorized(req.headers["x-admin-key"], process.env.ADMIN_API_KEY)) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    try {
      return res.json({ templates: deps.renderPreviews(), sms: renderSms() });
    } catch (error) {
      console.error("Error rendering email previews:", error);
      return res.status(500).json({ message: "Failed to render email previews." });
    }
  };
}
