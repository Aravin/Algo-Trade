# Client Persistence

The browser client now persists its setup through the Cloudflare Worker instead of relying only on browser storage.

## What Persists

- Broker accounts configured in the Broker Accounts page
- Strategy configuration saved from the Strategies page

Transient runtime state such as bot logs, cached market snapshots, and in-memory polling state still remains browser-local.

## How It Works

1. The React app reads cached values from `localStorage`.
2. On startup, the app hydrates broker accounts and strategy config from the Worker endpoint `/api/client-state`.
3. The Worker stores JSON blobs in the client D1 database table `client_state`.
4. When the user updates accounts or strategy config, the app writes to both `localStorage` and the Worker-backed store.

This gives the UI a fast local cache while still recovering setup after a browser restart or local dev session reset.

## Files

- `app/client/src/lib/accounts.ts`
- `app/client/src/lib/strategyConfig.ts`
- `app/client/src/lib/clientState.ts`
- `app/client/src/App.tsx`
- `app/client/worker/index.ts`
- `app/client/migrations/0002_client_state.sql`

## API

- `GET /api/client-state?key=<state-key>` returns `{ value }`
- `PUT /api/client-state` accepts `{ key, value }`

Current keys:

- `brokerAccounts`
- `strategyConfig`

## Migration

Apply the D1 migration that creates `client_state`:

`app/client/migrations/0002_client_state.sql`

From `app/client`, apply it locally during development:

```sh
yarn wrangler d1 migrations apply algo-trade-paper --local
```

Apply it to the remote Cloudflare D1 database before or alongside deployment:

```sh
yarn wrangler d1 migrations apply algo-trade-paper --remote
```

After migrations, deploy the Worker code:

```sh
yarn deploy
```

Without that table, the app still falls back to `localStorage`, but restart-safe persistence will depend on the local browser profile only.

## Current Limits

- OAuth pending state still uses `sessionStorage` during the redirect round-trip.
- Upstox API secrets are still not stored, by design.
- Existing repo-wide typecheck failures in unrelated files do not affect this persistence path.
