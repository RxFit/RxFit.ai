import { build as viteBuild } from "vite";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { STATIC_ROUTES } from "../shared/site";

function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  return parseYaml(m[1]) ?? {};
}

const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "dist/public");
const SSR_DIR = path.resolve(ROOT, "dist/ssr");
const CONTENT_DIR = path.resolve(ROOT, "content/blog");

function blogSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8");
      const data = parseFrontmatter(raw);
      return (data.slug as string) || f.replace(/\.mdx$/, "");
    });
}

/** Map a route path to its output file: "/" -> index.html, "/blog/x" -> blog/x/index.html. */
function outFile(route: string): string {
  if (route === "/") return path.join(PUBLIC_DIR, "index.html");
  return path.join(PUBLIC_DIR, route.replace(/^\//, ""), "index.html");
}

const SEO_BLOCK = /<!-- seo:start[\s\S]*?seo:end -->/;

export async function prerender() {
  console.log("building SSR bundle...");
  await viteBuild({
    build: {
      ssr: path.resolve(ROOT, "client/src/entry-server.tsx"),
      outDir: SSR_DIR,
      emptyOutDir: true,
      copyPublicDir: false,
    },
    logLevel: "warn",
  });

  const entryPath = path.join(SSR_DIR, "entry-server.js");
  const { render } = (await import(`file://${entryPath}`)) as {
    render: (url: string) => { html: string; head: string };
  };

  const template = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf-8");

  const renderToFile = (route: string, file: string, status: string) => {
    const { html, head } = render(route);
    let page = template.replace(SEO_BLOCK, head);
    page = page.replace("<!--app-html-->", html);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, page);
    console.log(`  prerendered ${route} -> ${path.relative(PUBLIC_DIR, file)} (${status})`);
  };

  const routes = [...STATIC_ROUTES, ...blogSlugs().map((s) => `/blog/${s}`)];
  console.log(`prerendering ${routes.length} route(s)...`);
  for (const route of routes) {
    renderToFile(route, outFile(route), "200");
  }

  // Custom 404 shell (NotFound route → noindex). Served with HTTP 404 for
  // any unmatched request in production.
  renderToFile("/__not_found__", path.join(PUBLIC_DIR, "404.html"), "404");

  // The SSR bundle is only needed at build time.
  fs.rmSync(SSR_DIR, { recursive: true, force: true });
  console.log("prerender complete");
}
