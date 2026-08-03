import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";
import { prerender } from "./prerender";

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
