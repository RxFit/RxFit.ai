/**
 * Pure argument parsing for the resend-email CLI (server/resend-email.ts).
 * Kept separate so it can be unit-tested without touching Gmail.
 */

export interface ResendArgs {
  kind: "welcome" | "lead";
  email: string;
  name: string;
  plan: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RESEND_USAGE = [
  "Usage: npx tsx server/resend-email.ts <welcome|lead> <email> [--name \"Full Name\"] [--plan \"Plan Name\"]",
  "  welcome  Re-send the post-checkout welcome email (uses --plan, default \"Kickstart\")",
  "  lead     Re-send the lead nurture email",
  "Examples:",
  "  npx tsx server/resend-email.ts welcome jane@example.com --name \"Jane Doe\" --plan \"Committed\"",
  "  npx tsx server/resend-email.ts lead sam@example.com --name Sam",
].join("\n");

/** Parse CLI argv (after node + script). Throws Error with a message on invalid input. */
export function parseResendArgs(argv: string[]): ResendArgs {
  const positional: string[] = [];
  let name = "";
  let plan = "Kickstart";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--name" || arg === "--plan") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}\n\n${RESEND_USAGE}`);
      if (arg === "--name") name = value;
      else plan = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}\n\n${RESEND_USAGE}`);
    } else {
      positional.push(arg);
    }
  }

  const [kind, email, ...extra] = positional;
  if (extra.length > 0) {
    throw new Error(`Unexpected extra arguments: ${extra.join(" ")}\n\n${RESEND_USAGE}`);
  }
  if (kind !== "welcome" && kind !== "lead") {
    throw new Error(`First argument must be "welcome" or "lead" (got: ${kind ?? "nothing"})\n\n${RESEND_USAGE}`);
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error(`Second argument must be a valid recipient email (got: ${email ?? "nothing"})\n\n${RESEND_USAGE}`);
  }

  return { kind, email, name, plan };
}
