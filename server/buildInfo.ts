/**
 * Identity of the running build, stamped by script/build.ts at bundle time.
 *
 * Why this exists: a Stripe credential alert reached the owner 18 days after
 * the code that fixed its wording and remedy had merged, because the live
 * deployment was still an older build. Nothing in the email or the status
 * endpoint said which build had sent it, so a stale deploy looked like a
 * fresh bug. Every alert and the /api/internal/credential-health snapshot now
 * carry this string, so "is production actually running main?" is answered
 * by the alert itself.
 *
 * esbuild replaces `process.env.RXFIT_BUILD_ID` with a literal during the
 * production build (see script/build.ts). Under tsx in development it is
 * unset and the fallback names that plainly.
 */
export const DEV_BUILD_ID = "dev (unbundled — not a deployed build)";

// The default argument MUST be the literal expression `process.env.RXFIT_BUILD_ID`:
// esbuild's `define` substitutes that exact member expression at bundle time.
// Reading it through an `env` parameter (e.g. `env.RXFIT_BUILD_ID`) compiles,
// but leaves a runtime lookup that the deployed bundle can never satisfy.
export function describeBuild(stamped: string | undefined = process.env.RXFIT_BUILD_ID): string {
  const id = stamped?.trim();
  return id ? id : DEV_BUILD_ID;
}

/**
 * Pure formatter shared with the build script: `<sha>[-dirty] built <iso-minute>`.
 * A dirty tree is flagged because a Replit workspace with uncommitted edits
 * can deploy code that exists on no GitHub branch.
 */
export function formatBuildId(parts: { sha: string | null; dirty: boolean; builtAt: Date }): string {
  const sha = parts.sha ?? "unknown-commit";
  const suffix = parts.dirty ? "-dirty" : "";
  return `${sha}${suffix} built ${parts.builtAt.toISOString().slice(0, 16)}Z`;
}
