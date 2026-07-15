/**
 * Brand-consistent hero images for auto-published blog posts.
 *
 * Generation: gpt-image-1 via the Replit OpenAI integration renders a dark
 * Lux-Industrial / champagne-gold editorial image for the post, sized for the
 * 1200x630 card/og-image slot.
 *
 * Storage: Replit Object Storage (survives redeploys — the deploy filesystem
 * is ephemeral). Images are uploaded under `public/blog-heroes/<slug>.webp`
 * and served by the Express route `GET /blog-heroes/:file`, so the stored
 * `heroImage` value is a site-relative path (`/blog-heroes/<slug>.webp`) that
 * works in the client, the crawler HTML, and og:image (prefixed with
 * SITE_URL where an absolute URL is needed).
 */
import OpenAI from "openai";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const HERO_PREFIX = "public/blog-heroes/";

/** Lazily constructed so importing this module never crashes the server. */
let storageClient: ObjectStorageClient | null = null;

function getObjectStorage(): ObjectStorageClient {
  if (!storageClient) {
    if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
      throw new Error(
        "Object storage is not configured (DEFAULT_OBJECT_STORAGE_BUCKET_ID missing) — cannot store hero images.",
      );
    }
    storageClient = new ObjectStorageClient({
      bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
    });
  }
  return storageClient;
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "OpenAI credentials missing (AI_INTEGRATIONS_OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_BASE_URL) — install the Replit OpenAI integration.",
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

/** Per-pillar scene direction so the imagery varies across the blog index. */
const PILLAR_SCENES: Record<string, string> = {
  "AI Coaching":
    "a sleek AI coaching dashboard concept: translucent glass panels floating in dark space showing an abstract health-score dial, trend lines, and a subtle human silhouette outline",
  Wearables:
    "a premium fitness wearable (minimal smartwatch or ring) resting on dark brushed metal, surrounded by faint holographic biometric readouts — heart-rate trace, sleep rings, recovery gauge",
  Accountability:
    "two abstract figures connected by a glowing progress thread across a dark architectural space, with faint calendar and streak markers etched in light",
};

function buildImagePrompt(title: string, pillar: string): string {
  const scene =
    PILLAR_SCENES[pillar] ||
    "an abstract premium health-technology scene: glass panels, biometric trend lines, and subtle human presence in dark space";
  return `Editorial hero illustration for a premium health-tech article titled "${title}".

Scene: ${scene}.

Style: dark luxury-industrial aesthetic ("command HUD" brand). Near-black charcoal background (#0c0b09 range), champagne-gold accent light (warm metallic gold, hsl(43 53% 54%)), thin gold HUD detailing — fine grid lines, corner brackets, small tick marks. Glassmorphism: frosted translucent panels with soft gold rim light. Cinematic soft glow, shallow depth of field, high contrast, refined and minimal composition with generous negative space.

Strictly NO text, NO words, NO letters, NO numbers, NO logos, NO watermarks. No bright colors other than the champagne-gold accent. Photorealistic 3D render quality, wide landscape composition.`;
}

/**
 * Generate a hero image for a post and upload it to object storage.
 * Returns the site-relative URL to store in generated_posts.hero_image.
 * Throws on any failure — callers decide whether that blocks publishing.
 */
export async function generateAndStoreHeroImage(
  slug: string,
  title: string,
  pillar: string,
): Promise<string> {
  const openai = getOpenAI();

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt: buildImagePrompt(title, pillar),
    size: "1536x1024",
    quality: "medium",
    output_format: "webp",
    output_compression: 82,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 1000) throw new Error("gpt-image-1 returned an implausibly small image");

  const objectName = `${HERO_PREFIX}${slug}.webp`;
  const upload = await getObjectStorage().uploadFromBytes(objectName, bytes);
  if (!upload.ok) {
    throw new Error(`Object storage upload failed for ${objectName}: ${upload.error?.message}`);
  }

  console.log(
    `[hero-image] Generated + stored ${objectName} (${Math.round(bytes.length / 1024)} KB)`,
  );
  return `/blog-heroes/${slug}.webp`;
}

/**
 * Fetch a stored hero image's bytes for the serving route.
 * Returns null when the object doesn't exist.
 */
export async function getHeroImageBytes(fileName: string): Promise<Buffer | null> {
  const download = await getObjectStorage().downloadAsBytes(`${HERO_PREFIX}${fileName}`);
  if (!download.ok) return null;
  return download.value[0];
}
