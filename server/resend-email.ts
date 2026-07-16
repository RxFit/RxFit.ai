/**
 * One-command re-send for missed welcome/lead emails.
 *
 * Failed customer emails are recorded in the "RxFit Alerts" sheet tab with
 * the recipient address; this CLI re-sends the exact branded template so the
 * owner can clear the backlog after a Gmail outage:
 *
 *   npx tsx server/resend-email.ts welcome jane@example.com --name "Jane Doe" --plan "Committed"
 *   npx tsx server/resend-email.ts lead sam@example.com --name Sam
 *
 * Exits 1 (loudly) if the send fails — no record-and-continue here.
 */
import { parseResendArgs, RESEND_USAGE } from "./resendArgs";
import { sendWelcomeEmailOrThrow, sendLeadEmailOrThrow } from "./emailService";

async function main() {
  let args;
  try {
    args = parseResendArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const { kind, email, name, plan } = args;
  console.log(`Re-sending ${kind} email to ${email}${name ? ` (${name})` : ""}${kind === "welcome" ? ` [plan: ${plan}]` : ""}...`);

  if (kind === "welcome") {
    await sendWelcomeEmailOrThrow(email, name, plan);
  } else {
    await sendLeadEmailOrThrow(email, name);
  }
  console.log(`Done. ${kind === "welcome" ? "Welcome" : "Lead nurture"} email re-sent to ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Re-send FAILED — the email was NOT delivered:", error);
    console.error(`\n${RESEND_USAGE}`);
    process.exit(1);
  });
