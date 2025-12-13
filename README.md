# DJAMMS Obie Electron Player — Scaffold

This repository is a scaffold for the DJAMMS Obie Electron Player described in the project manifesto.

Quick start

1. Install deps:

```bash
npm install
```

2. Run in development:

```bash
npm run dev
```

3. Run tests:

```bash
npm test
```

Files of interest

- `src/main/main.js` — minimal Electron entry for development
- `src/integration/queue-orchestrator.js` — Queue orchestrator stub and tests
- `db/schema.sql` — starting Supabase / Postgres schema

This scaffold was generated from the DJAMMS Project Manifesto and is intended for iterative development.

Environment and Supabase
------------------------

This project uses environment variables to store Supabase credentials. Do not commit secrets into git.

- Copy `.env.example` to `.env` and fill your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- A server-side `SUPABASE_SERVICE_ROLE_KEY` is supported for server-only writes but must be kept secret.

The `QueueOrchestrator` will auto-create a `SupabaseAdapter` when valid credentials are present and can subscribe to updates for a player ID via `startRealtime(playerId)`.

Files added in this scaffold
---------------------------

- `src/integration/supabase-adapter.js` — adapter to centralize Supabase client usage and realtime subscription helpers.
- `src/integration/queue-orchestrator.js` — updated: now optional Supabase wiring and `startRealtime` / `stopRealtime` helpers.

Testing notes
-------------

The scaffold includes simple Jest tests that cover the queue orchestrator and a few adapter behaviors. These are intentionally lightweight and are safe to run in CI after `npm install`.

Security note
-------------

Your `.env` file must never be committed to source control. Keep secrets (service role keys) in secure vaults or CI-set env variables.

