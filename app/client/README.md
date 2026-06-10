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

The persistence change for broker accounts and strategy config depends on `migrations/0002_client_state.sql` being applied.

## Relevant Files

- `src/lib/accounts.ts`
- `src/lib/strategyConfig.ts`
- `src/lib/clientState.ts`
- `src/App.tsx`
- `worker/index.ts`
- `migrations/0002_client_state.sql`

## Notes

- The client uses Yarn v1 in this folder.
- Full repo typecheck is currently blocked by unrelated pre-existing errors in other client files.
