/**
 * tickLog.ts — Rolling per-tick score log for threshold backtesting.
 *
 * Stores the last MAX_TICKS ticks in localStorage. Each tick records
 * the raw bull/bear scores, confidence, signal, and market context so
 * a threshold optimizer can replay history with different settings.
 */

export interface TickRecord {
  /** Unix epoch ms */
  ts: number
  bullScore: number
  bearScore: number
  /** Dynamic max score (varies with VRD availability) */
  scoreMax: number
  confidence: 'strong' | 'moderate' | 'weak' | 'none'
  signal: 'BUY_CE' | 'BUY_PE' | 'WAIT' | 'NO_TRADE'
  vix: number | null
  /** Thresholds that were active when this tick fired */
  strongThreshold: number
  moderateThreshold: number
  strongGap: number
  moderateGap: number
}

const KEY = 'algo-trade:tick-log'
const MAX_TICKS = 500

export function appendTick(record: TickRecord): void {
  try {
    const raw = localStorage.getItem(KEY)
    const ticks: TickRecord[] = raw ? (JSON.parse(raw) as TickRecord[]) : []
    ticks.push(record)
    // Keep only the latest MAX_TICKS
    if (ticks.length > MAX_TICKS) ticks.splice(0, ticks.length - MAX_TICKS)
    localStorage.setItem(KEY, JSON.stringify(ticks))
  } catch {
    // localStorage unavailable or quota exceeded — silently ignore
  }
}

export function getTickLog(): TickRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TickRecord[]) : []
  } catch {
    return []
  }
}

export function clearTickLog(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// ─── Threshold sweep ──────────────────────────────────────────────────────────

export interface ThresholdResult {
  strongThreshold: number
  moderateThreshold: number
  strongGap: number
  moderateGap: number
  totalTicks: number
  /** Ticks that would have fired a trade (Strong or Moderate) */
  tradeTicks: number
  /** Strong signals only */
  strongTicks: number
  /** Moderate signals only */
  moderateTicks: number
  /** Fraction of CE signals vs total trade signals */
  cePct: number
  /** Fraction of PE signals vs total trade signals */
  pePct: number
}

/**
 * Replays the stored tick log with different threshold settings and
 * returns a result row for each combination.
 */
export function sweepThresholds(
  ticks: TickRecord[],
  strongRange: [number, number] = [10, 20],
  moderateRange: [number, number] = [6, 14],
  gapOptions: { strongGap: number; moderateGap: number }[] = [
    { strongGap: 6, moderateGap: 3 },
    { strongGap: 5, moderateGap: 3 },
    { strongGap: 4, moderateGap: 2 },
  ],
): ThresholdResult[] {
  if (!ticks || ticks.length === 0) return []
  const results: ThresholdResult[] = []

  for (let sT = strongRange[0]; sT <= strongRange[1]; sT += 2) {
    for (let mT = moderateRange[0]; mT <= moderateRange[1]; mT += 2) {
      if (mT >= sT) continue // moderate must be < strong
      for (const { strongGap, moderateGap } of gapOptions) {
        let strong = 0,
          moderate = 0,
          ce = 0,
          pe = 0

        for (const tick of ticks) {
          const top = Math.max(tick.bullScore, tick.bearScore)
          const gap = Math.abs(tick.bullScore - tick.bearScore)
          const scoreMax =
            tick.scoreMax && tick.scoreMax > 0 ? tick.scoreMax : 20
          const scale = scoreMax / 20
          const scaledST = sT * scale
          const scaledMT = mT * scale

          const dominant =
            tick.bullScore > tick.bearScore
              ? 'CE'
              : tick.bearScore > tick.bullScore
                ? 'PE'
                : null

          const satisfiesStrong = top >= scaledST
          const satisfiesModerate = top >= scaledMT

          let conf: 'strong' | 'moderate' | 'none' = 'none'
          if (satisfiesStrong && gap >= strongGap) conf = 'strong'
          else if (satisfiesModerate && gap >= moderateGap) conf = 'moderate'

          if (conf === 'strong') {
            strong++
            if (dominant === 'CE') ce++
            if (dominant === 'PE') pe++
          } else if (conf === 'moderate') {
            moderate++
            if (dominant === 'CE') ce++
            if (dominant === 'PE') pe++
          }
        }

        const tradeTicks = strong + moderate
        results.push({
          strongThreshold: sT,
          moderateThreshold: mT,
          strongGap,
          moderateGap,
          totalTicks: ticks.length,
          tradeTicks,
          strongTicks: strong,
          moderateTicks: moderate,
          cePct: tradeTicks > 0 ? Math.round((ce / tradeTicks) * 100) : 0,
          pePct: tradeTicks > 0 ? Math.round((pe / tradeTicks) * 100) : 0,
        })
      }
    }
  }

  // Sort by trade frequency (fewest first — less noise is better)
  return results.sort((a, b) => a.tradeTicks - b.tradeTicks)
}
