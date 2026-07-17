---
name: OpenGraph image auto-regeneration
description: Why client/public/opengraph.jpg shows up as an unrelated binary diff in task commits
---

`client/public/opengraph.jpg` can appear as a small unrelated binary change (~100-byte size delta) in a task commit even when no code touches it.

**Why:** Nothing in the repo writes that file — `vite-plugin-meta-images.ts` only reads it. The Replit platform regenerates the OG image from the app preview screenshot (e.g. after a workflow restart / screenshot capture), and the auto-checkpoint commits it alongside the task's changes.

**How to apply:** When a code review flags an "unintentional" opengraph.jpg change in a commit, verify no script writes it (grep for the filename) and then treat it as benign platform churn — do not revert or split the commit.
