#!/bin/bash
set -e

# Post-merge reconciliation for the rxfit.ai marketing site.
# Runs after a task is merged: refresh dependencies and sync the DB schema.
# Must be idempotent and non-interactive (stdin is closed).

echo "[post-merge] Installing dependencies..."
npm install --no-audit --no-fund

echo "[post-merge] Pushing Drizzle schema..."
npm run db:push -- --force

echo "[post-merge] Done."
