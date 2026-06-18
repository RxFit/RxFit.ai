import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import App from "./App";
import {
  HeadContext,
  createHeadCollector,
  renderHeadToString,
} from "./lib/seo";

/**
 * Render a route to its initial HTML body + serialized <head> tags.
 * Used by the build-time prerender step (script/prerender.ts) so every public
 * route ships crawlable content and route-specific metadata in the first
 * response instead of an empty SPA shell.
 */
export function render(url: string): { html: string; head: string } {
  const collector = createHeadCollector();
  const html = renderToString(
    <HeadContext.Provider value={collector}>
      <Router ssrPath={url}>
        <App />
      </Router>
    </HeadContext.Provider>,
  );
  return { html, head: renderHeadToString(collector) };
}
