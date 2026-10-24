// Calendar heatmap layout: weeks as columns, Monday first, and quartile levels for the colour.

export type Day = { date: string; count: number; breaches?: number }
export type Cell = { date: string; count: number; breaches: number; level: 0 | 1 | 2 | 3 | 4; week: number; weekday: number; inRange: boolean }

const DAY = 86_400_000
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** Monday = 0 ... Sunday = 6. */
const weekday = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7

/** Level 0 is no activity. The rest are quartiles of the days that had any, so one huge day cannot flatten the rest. */
export function levelsFor(counts: number[]): (n: number) => 0 | 1 | 2 | 3 | 4 {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b)
  if (!nz.length) return () => 0
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))]!
  const [a, b, c] = [q(0.25), q(0.5), q(0.75)]
  return (n) => (n <= 0 ? 0 : n <= a ? 1 : n <= b ? 2 : n <= c ? 3 : 4)
}

export function layoutHeat(days: Day[], weeks = 26): { cells: Cell[]; weeks: number; months: { week: number; label: string }[]; total: number; busiest: Day | null; breachFreeRun: number } {
  if (!days.length) return { cells: [], weeks: 0, months: [], total: 0, busiest: null, breachFreeRun: 0 }
  const byDate = new Map(days.map((d) => [d.date, d]))
  const last = Math.max(...days.map((d) => utc(d.date)))
  const lastWeekStart = last - weekday(last) * DAY
  const firstWeekStart = lastWeekStart - (weeks - 1) * 7 * DAY
  const level = levelsFor(days.filter((d) => utc(d.date) >= firstWeekStart && utc(d.date) <= last).map((d) => d.count))
  const cells: Cell[] = []
  for (let w = 0; w < weeks; w++) {
    for (let wd = 0; wd < 7; wd++) {
      const ms = firstWeekStart + (w * 7 + wd) * DAY
      const date = iso(ms)
      const d = byDate.get(date)
      cells.push({ date, count: d?.count ?? 0, breaches: d?.breaches ?? 0, level: level(d?.count ?? 0), week: w, weekday: wd, inRange: ms <= last })
    }
  }
  const months: { week: number; label: string }[] = []
  let prev = -1
  for (let w = 0; w < weeks; w++) {
    const m = new Date(firstWeekStart + w * 7 * DAY).getUTCMonth()
    if (m !== prev) {
      months.push({ week: w, label: new Date(firstWeekStart + w * 7 * DAY).toLocaleString('en', { month: 'short', timeZone: 'UTC' }) })
      prev = m
    }
  }
  const inView = cells.filter((c) => c.inRange)
  const busiest = inView.reduce<Cell | null>((best, c) => (c.count > (best?.count ?? 0) ? c : best), null)
  // Longest run of days with no breach, counted over days that fall in the window and up to the last date.
  let run = 0
  let best = 0
  for (const c of inView) {
    run = c.breaches > 0 ? 0 : run + 1
    best = Math.max(best, run)
  }
  return { cells, weeks, months, total: inView.reduce((a, c) => a + c.count, 0), busiest: busiest && busiest.count > 0 ? { date: busiest.date, count: busiest.count, breaches: busiest.breaches } : null, breachFreeRun: best }
}
