---
name: Replit Object Storage from server code
description: Quirks when the Express app itself reads/writes Replit Object Storage at runtime
---

- `new Client()` from `@replit/object-storage` fails with "A bucket name is needed" in this project — pass `{ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID }` explicitly.
- **Why:** the SDK does not pick up the env var set by the platform's object-storage setup here; only an explicit bucketId worked.
- **How to apply:** any new server module touching object storage should construct the client with the explicit bucketId (see the hero-image module for the pattern).
- Runtime-generated assets (e.g. AI hero images) must go to object storage, not `client/public`/`dist` — the deploy filesystem is ephemeral and rebuilt on redeploy. Serve them through an Express route with a stable site-relative path so client, crawler HTML, and og:image all work.
- gpt-image-1 via the Replit OpenAI integration proxy works with `size`, `quality`, `output_format: "webp"`, and `output_compression`; returns `b64_json`. A 1536x1024 medium-quality webp at ~82 compression lands around 65 KB.
