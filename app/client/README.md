# Algo Trade Client

React + TypeScript dashboard for the V5 browser-based trading workflow.

## First-Time Setup Checklist

From `app/client`:

- [ ] Install dependencies: `yarn install`
- [ ] Apply local D1 migrations: `yarn wrangler d1 migrations apply algo-trade-paper --local`
- [ ] Start the app in dev: `yarn dev`
- [ ] Deploy the Worker: `yarn deploy`

If you need the hosted D1 database updated too, run `yarn wrangler d1 migrations apply algo-trade-paper --remote` before deploying.

## Scripts

- `yarn dev` starts the Vite client locally
- `yarn build` runs TypeScript build and Vite production build
- `yarn deploy` builds and deploys the Worker
- `yarn cf-typegen` regenerates Worker binding/runtime types after `wrangler.jsonc` changes
- `yarn validate` runs typecheck, eslint, and prettier checks

## Persistence

Broker accounts and saved strategy configuration now persist through the client Worker and D1, so they can survive browser restarts and local dev session resets.

- Worker endpoint: `/api/client-state`
- D1 table: `client_state`
- Local cache: `localStorage`
- Detailed notes: `../../docs/client-persistence.md`

The app still uses browser-local storage for transient bot/runtime data and `sessionStorage` for the short-lived Upstox OAuth redirect handoff.

## D1 Migrations And Deploy

Apply pending D1 migrations before expecting restart-safe persistence to work outside the current browser profile.

From `app/client`:

```sh
yarn wrangler d1 migrations apply algo-trade-paper --local
```

Apply the same migration to the remote Cloudflare database:

```sh
yarn wrangler d1 migrations apply algo-trade-paper --remote
```

Deploy the Worker after schema and code changes:

```sh
yarn deploy
```

The consolidated schema, including broker-account and strategy client state,
is in `migrations/0001_initial.sql`.

## Trading And Authentication Safety

- The strategy bot is mounted at the app root, so changing dashboard pages does
  not stop open-position supervision.
- Stop aborts the active polling tick and disables new entries, but deliberately
  retains open positions in local state. A manually stopped bot does not run EOD
  or hard-stop exits; the strategy header shows a persistent warning until
  supervision is resumed.
- Worker request throttling uses Cloudflare's native rate-limit binding rather
  than isolate-local mutable counters.
- Live trading must be armed with an explicit confirmation each time Start is
  pressed. A persisted live session may resume supervision of an existing
  position, but it cannot place a new entry until re-armed.
- Missing candle data disables entries but still runs degraded open-position
  exit checks using available option quotes and persisted risk state.
- The selected Upstox option contract supplies the execution lot size and
  expiry. Static index lot sizes and calculated expiry dates are fallback
  display/safety values only.
- Authenticated Worker routes fail closed if `AUTH0_DOMAIN` or
  `AUTH0_AUDIENCE` is missing. These public identifiers are configured in
  `wrangler.jsonc`; Upstox credentials remain secrets in `.dev.vars` locally
  and Cloudflare secrets in production.

## Relevant Files

- `src/lib/accounts.ts`
- `src/lib/strategyConfig.ts`
- `src/lib/clientState.ts`
- `src/App.tsx`
- `worker/index.ts`
- `migrations/0001_initial.sql`

## Notes

- The client uses Yarn v1 in this folder.
- Run `yarn cf-typegen` whenever Worker bindings or the compatibility date change.
