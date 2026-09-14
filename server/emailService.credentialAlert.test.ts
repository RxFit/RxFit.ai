/**
 * The credential alert email's REMEDY must derive from the error, not from the
 * service name.
 *
 * The production incident sent two emails for one root cause. Both quoted an
 * error saying "Set STRIPE_SECRET_KEY in Replit Secrets instead" and then told
 * the owner to "open the Replit workspace → Integrations and re-authorize the
 * Stripe connection" — the opposite action, and one that resolves the sandbox
 * connection, which would have turned the monitor green while live checkout
 * stayed broken. The second email additionally prescribed a Stripe metadata
 * edit that would have started mischarging buyers.
 */
import { describe, it, expect } from "vitest";
import { classifyCredentialAlert, credentialAlertCopy } from "./emailService";

/** The error string that actually shipped in both production alert emails. */
const PRODUCTION_ERROR =
  "Stripe production connection not found via Connector. Set STRIPE_SECRET_KEY in Replit Secrets instead.";

describe("classifyCredentialAlert", () => {
  it("classifies the verbatim production error as a missing secret", () => {
    expect(classifyCredentialAlert("stripe", PRODUCTION_ERROR)).toBe("stripe-missing-secret");
  });

  it("classifies the no-credentials-at-all error as a missing secret", () => {
    expect(
      classifyCredentialAlert(
        "stripe",
        "No Stripe credentials found. Set STRIPE_SECRET_KEY in Replit Secrets, or configure the Stripe Connector.",
      ),
    ).toBe("stripe-missing-secret");
    expect(classifyCredentialAlert("stripe", "Stripe secret key resolved empty")).toBe(
      "stripe-missing-secret",
    );
  });

  it("classifies a rejected key separately from a missing one", () => {
    expect(classifyCredentialAlert("stripe", "Invalid API Key provided")).toBe("stripe-rejected-key");
  });

  it("classifies a test-mode key on the live deployment", () => {
    expect(
      classifyCredentialAlert(
        "stripe",
        "Stripe credentials resolved but they are TEST-mode keys (balance.livemode=false) on the live deployment.",
      ),
    ).toBe("stripe-test-key");
  });

  it("classifies catalog drift ahead of the messages that also mention Stripe", () => {
    expect(
      classifyCredentialAlert(
        "stripe",
        "Live Stripe catalog no longer matches the site's advertised pricing:\n- kickstart (price_x): price is not active in Stripe",
      ),
    ).toBe("stripe-catalog-mismatch");
  });

  it("leaves gmail and sheets on the connector path", () => {
    expect(classifyCredentialAlert("gmail", "token fetch failed")).toBe("connector");
    expect(classifyCredentialAlert("sheets", "connection not found via Connector")).toBe("connector");
  });
});

describe("credentialAlertCopy", () => {
  it("tells the owner to set the Secret, and explicitly NOT to re-authorize Integrations", () => {
    const { headline, impact, remedy } = credentialAlertCopy("stripe", "Stripe", "stripe-missing-secret");
    expect(headline).toContain("STRIPE_SECRET_KEY");
    expect(remedy).toContain("STRIPE_SECRET_KEY");
    expect(remedy).toContain("Secrets");
    // The regression that matters: the old copy sent the owner to Integrations.
    expect(remedy).toMatch(/NOT the fix/i);
    expect(impact).toContain("Checkout and pricing");
  });

  it("warns against the metadata.tier edit the old plan-tier alert prescribed", () => {
    const { impact, remedy } = credentialAlertCopy("stripe", "Stripe", "stripe-catalog-mismatch");
    expect(remedy).toContain("shared/stripe-constants.ts");
    expect(remedy).toMatch(/Do NOT add metadata\.tier/);
    // A catalog mismatch is not a credential outage; the impact must not claim it is.
    expect(impact).toContain("The Stripe key works");
  });

  it("does not tell the owner to re-authorize when a key is present but refused", () => {
    const { remedy } = credentialAlertCopy("stripe", "Stripe", "stripe-rejected-key");
    expect(remedy).toMatch(/Rotate it/i);
    expect(remedy).toMatch(/will not help/i);
  });

  it("keeps the existing Integrations remedy and impact copy for gmail and sheets", () => {
    const gmail = credentialAlertCopy("gmail", "Gmail", "connector");
    expect(gmail.remedy).toBe("open the Replit workspace → Integrations and re-authorize the Gmail connection.");
    expect(gmail.impact).toBe("Welcome/lead emails and blog notifications will fail until this is fixed.");

    const sheets = credentialAlertCopy("sheets", "Google Sheets", "connector");
    expect(sheets.remedy).toContain("re-authorize the Google Sheets connection");
    expect(sheets.impact).toContain("backup alert channel is dead");
  });
});
