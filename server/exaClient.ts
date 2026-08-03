/**
 * Minimal Exa (exa.ai) search client for the blog auto-publisher.
 * Requires the EXA_API_KEY secret at runtime; fails loudly when missing.
 */

import { screenUrl } from "./linkHealth";

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
}

function getApiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    throw new Error("EXA_API_KEY is not set — cannot run blog research. Add it as a secret.");
  }
  return key;
}

async function exaSearch(query: string, numResults: number): Promise<ExaResult[]> {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults,
      contents: {
        text: { maxCharacters: 2500 },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Exa search failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    results?: { title?: string; url?: string; publishedDate?: string; text?: string }[];
  };

  return (data.results ?? [])
    .filter((r) => r.url && r.text)
    .filter((r) => {
      // Drop staging hostnames and bad schemes before they reach the writing
      // prompt. A `preview-www.nature.com` URL came back from Exa, was cited by
      // the LLM, and shipped to production — cheapest place to stop that is
      // here, where the check costs nothing.
      const problem = screenUrl(r.url!);
      if (problem) {
        console.warn(`[exa] Discarding unusable source ${r.url} — ${problem.reason}`);
        return false;
      }
      return true;
    })
    .map((r) => ({
      title: r.title || r.url!,
      url: r.url!,
      publishedDate: r.publishedDate,
      text: (r.text || "").trim(),
    }));
}

/**
 * Research a keyword theme: run a couple of angled searches and return a
 * de-duplicated set of source excerpts for the writing prompt.
 */
export async function researchTheme(theme: string): Promise<ExaResult[]> {
  const year = new Date().getFullYear();
  const queries = [
    `${theme} fitness health research findings`,
    `${theme} statistics study ${year}`,
  ];

  const batches = await Promise.all(queries.map((q) => exaSearch(q, 5)));

  const seen = new Set<string>();
  const results: ExaResult[] = [];
  for (const batch of batches) {
    for (const result of batch) {
      const key = result.url.replace(/[?#].*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(result);
    }
  }

  if (results.length === 0) {
    throw new Error(`Exa research returned no usable sources for theme "${theme}"`);
  }

  return results.slice(0, 8);
}
