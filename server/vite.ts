import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { parse as parseYaml } from "yaml";
import { STATIC_ROUTES } from "@shared/site";

function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  return parseYaml(m[1]) ?? {};
}

const viteLogger = createLogger();

const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "content", "blog");

/** Whether a request path corresponds to a real route (so dev can return 404
 *  for unknown URLs / blog slugs, matching production behavior). */
function isKnownRoute(reqPath: string): boolean {
  const clean = reqPath.replace(/\/+$/, "") || "/";
  if ((STATIC_ROUTES as readonly string[]).includes(clean)) return true;
  // Internal admin dashboard — real route, but deliberately kept out of
  // STATIC_ROUTES so it never appears in the sitemap.
  if (clean === "/admin") return true;

  const blogMatch = clean.match(/^\/blog\/(.+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    if (!fs.existsSync(CONTENT_DIR)) return false;
    return fs.readdirSync(CONTENT_DIR).some((f) => {
      if (!f.endsWith(".mdx")) return false;
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8");
      const data = parseFrontmatter(raw);
      const fileSlug = (data.slug as string) || f.replace(/\.mdx$/, "");
      return fileSlug === slug;
    });
  }
  return false;
}

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      // Unknown URLs / blog slugs return 404 (the SPA renders NotFound, which
      // is also noindex); real routes return 200. Derive the path from
      // originalUrl — under an app.use mount, req.path is stripped to "/".
      const reqPath = url.split("?")[0];
      const status = isKnownRoute(reqPath) ? 200 : 404;
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
