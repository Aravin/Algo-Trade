# AI Agent Operating Guidelines — `app/client`

> **Scope**: Applied to all AI Coding Agents (Gemini, Antigravity, GitHub Copilot, Claude Code, Cursor) modifying code inside `app/client/`.

---

## 1. General Principles & Constraints

1. **Type Safety & No Implicit `any`**:
   - Always maintain strict TypeScript types. Do not insert `any` or disable ESLint rules without explicit justification.
   - Reuse shared interfaces from [`src/lib/types.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/types.ts) and [`worker/types.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/types.ts).

2. **Dual Persistence Protocol**:
   - Strategy config updates and broker account modifications must persist via Worker API (`/api/client-state`) AND sync to `localStorage` as local fallback.
   - Do not bypass `src/lib/clientState.ts` when introducing new user configuration keys.

3. **Paper Trading Safety Guard**:
   - Ensure paper trade orders (`/api/paper/trades/enter`) never trigger real broker API endpoints unless explicit live trading mode is armed.
   - Maintain PnL calculation math and slippage rules in [`worker/paperTrading.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/paperTrading.ts).

4. **Worker Endpoint Conventions**:
   - Authenticated endpoints must call `verifyAuth0Token(request, env)`.
   - Public market proxy endpoints must remain unauthenticated for OAuth callback handoffs and background market polling.
   - Always handle errors with appropriate HTTP status codes and structured `{ error: string }` JSON responses.

---

## 2. Code Quality & Pre-Commit Rules

Before finishing any task inside `app/client`:

1. Run unit tests to verify strategy algorithms remain unbroken:
   ```bash
   yarn test
   ```
2. Run validation check:
   ```bash
   yarn validate
   ```
3. Do not commit broken pre-commit hooks or bypass husky checks.

---

## 3. Fast Reference Files

- [llm.txt](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/llm.txt) — Token-dense context overview.
- [review.md](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/review.md) — Technical & architectural code review.
- [OKF.md](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/OKF.md) — Overall Knowledge Framework.
- [AI_INDEX.md](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/AI_INDEX.md) — Fast-lookup index for files, symbols, and components.
