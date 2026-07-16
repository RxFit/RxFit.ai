---
name: pg SSL config precedence
description: node-postgres merges the parsed connection string OVER the explicit pool config — the URL's sslmode always wins over the `ssl` option.
---

# pg SSL config precedence

**Rule:** In node-postgres (`pg`), `ConnectionParameters` does
`Object.assign({}, config, parse(config.connectionString))` — values parsed
from the connection string OVERRIDE explicit pool/client options. So an
`ssl: {...}` option is dead code whenever the URL carries `sslmode`.

**Why:** Discovered while auditing production DB TLS. Dev URL has
`sslmode=disable` (local helium proxy → always plaintext, any ssl option
ignored); prod URL has `sslmode=require`, which pg ≥ 8.16 treats as an alias
for **verify-full** (`parse()` returns `ssl: {}` → Node TLS defaults → full
chain + hostname verification). Production had therefore been running full
cert verification all along, and a `{rejectUnauthorized:false}` override was
silently ignored — evidence: pg's "sslmode aliases" security warning in deploy
logs plus successful boots of connections with no ssl override.

**How to apply:**
- To know what TLS behavior an app really has, read the URL's `sslmode`, not
  the pool config. Verify empirically with
  `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`.
- Setting `ssl: {rejectUnauthorized:true}` is still worthwhile as a backstop
  for URLs without `sslmode` (and against pg v9's planned weaker libpq-compat
  semantics), but expect it to be inert while `sslmode` is present.
- Replit-managed prod Postgres (helium) presents a publicly verifiable cert —
  strict verification is safe.
