---
name: Source-scanning completeness guards
description: Pitfalls when a test counts literal markers in a source file to enforce registry completeness
---

Rule: when a test enforces completeness by counting a literal marker (e.g. `<!DOCTYPE html>`) in a source file, never write that literal string in comments/docstrings of the scanned file — it inflates the count and fails the guard.

**Why:** The email-template palette test counts doctype declarations in the templates file and requires the count to equal the template registry size. A registry doc comment that quoted the literal marker made the count 8 vs 7 registered templates.

**How to apply:** Reword comments to describe the marker ("HTML doctype declarations") instead of quoting it; same caution applies to any grep-the-source build gate (price guards, wiring validators) — keep guarded literals out of prose in scanned files.
