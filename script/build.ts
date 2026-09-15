import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";
import { prerender } from "./prerender";
import { formatBuildId } from "../server/buildInfo";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "compression",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

function runTests() {
  console.log("running tests (vitest)...");
  const result = spawnSync("npx", ["vitest", "run"], {
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (result.status !== 0) {
    throw new Error(
      `Tests failed (exit code ${result.status ?? "unknown"}). Aborting build.`,
    );
  }
}

function runSeoValidation() {
  console.log("validating SEO / structured data / internal links...");
  const result = spawnSync("node", ["scripts/validate-seo.mjs"], {
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (result.status !== 0) {
    throw new Error(
      `SEO validation failed (exit code ${result.status ?? "unknown"}). Aborting build.`,
    );
  }
}

/**
 * Stamp the bundle with the commit it was built from. Read by
 * server/buildInfo.ts and surfaced in every credential alert email and the
 * internal health snapshot, so a stale deployment identifies itself. Never
 * fails the build: a checkout without git history still gets a timestamp.
 *
 * "dirty" counts untracked files too, not just modified tracked ones: build
 * inputs here are discovered by glob (content/blog/*.mdx via blogLoader,
 * everything under client/public via Vite), so an untracked post or asset
 * ships in the deployment while HEAD alone would claim a clean, reproducible
 * commit. Ignored paths (node_modules, dist, .env) never count.
 */
function computeBuildId(): string {
  const git = (args: string[]) => {
    const r = spawnSync("git", args, { encoding: "utf-8" });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const sha = git(["rev-parse", "--short", "HEAD"]);
  const porcelain = sha === null ? null : git(["status", "--porcelain", "--untracked-files=all"]);
  const id = formatBuildId({ sha, dirty: porcelain !== null && porcelain.length > 0, builtAt: new Date() });
  console.log(`build id: ${id}`);
  return id;
}

async function buildAll() {
  runTests();
  runSeoValidation();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("prerendering public routes...");
  await prerender();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.RXFIT_BUILD_ID": JSON.stringify(computeBuildId()),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
