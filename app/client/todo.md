# Todo List — Algo-Trade

## Background / Offline Strategy Execution Engine

- [ ] **Autonomous Server-Side Strategy Execution**:
  - **Problem**: The strategy bot engine (`useStrategyBot.ts`) currently runs as a React hook inside the user's browser tab. If the user closes the browser, real-time tick polling, technical indicator calculations, trailing stop-loss supervision, and auto-exits stop immediately.
  - **Proposed Solution**: Build a background execution worker / scheduled service (e.g., Cloudflare Workflows, Durable Objects, or a Cron Worker in `app/cron`) to autonomously fetch ticks, evaluate strategy signals, and execute paper/live trade exits even when no browser tabs are active.
