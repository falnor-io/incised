// Statistical process control for a failure rate (a p-chart), with the Western Electric run rules and Nelson's four more.
// Pure functions, so the maths can be tested and checked by a statistician in one file.

export type SpcPoint = { label: string; failures: number; n: number; /** When the point's period ended. Needed to place events on the chart. */ at?: string }
export type SpcRule = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
/** The four Western Electric rules. The default. */
export const WESTERN_ELECTRIC: SpcRule[] = [1, 2, 3, 4]
/** All eight of Nelson's rules: the Western Electric four plus a trend, hugging the centre, alternating and a run beyond one sigma. */
export const NELSON: SpcRule[] = [1, 2, 3, 4, 5, 6, 7, 8]
export type SpcResult = {
  center: number
  points: { label: string; n: number; p: number; z: number; sigma: number; ucl: number; lcl: number; rules: SpcRule[] }[]
  signals: { index: number; rule: SpcRule }[]
}

export const RULE_TEXT: Record<SpcRule, string> = {
  1: 'One point beyond 3 standard deviations',
  2: 'Two of three points in a row beyond 2 standard deviations, on the same side',
  3: 'Four of five points in a row beyond 1 standard deviation, on the same side',
  4: 'Eight points in a row on the same side of the centre line',
  5: 'Six points in a row, each higher than the last or each lower',
  6: 'Fifteen points in a row within 1 standard deviation of the centre line, which is less variation than chance gives',
  7: 'Fourteen points in a row, alternating up and down',
  8: 'Eight points in a row beyond 1 standard deviation, on either side',
}

/**
 * p-chart. The centre line comes from the first `baseline` points (all of them by default), pooled so a big
 * sample counts for more than a small one. Limits are per point, because each point has its own sample size.
 */
export function pChart(data: SpcPoint[], baseline = data.length, rules: SpcRule[] = WESTERN_ELECTRIC): SpcResult {
  const base = data.slice(0, Math.max(1, Math.min(baseline, data.length)))
  const totalN = base.reduce((a, d) => a + d.n, 0)
  const center = totalN > 0 ? base.reduce((a, d) => a + d.failures, 0) / totalN : 0
  const points = data.map((d) => {
    const n = Math.max(d.n, 1)
    const p = d.failures / n
    const sigma = Math.sqrt((center * (1 - center)) / n)
    const z = sigma > 0 ? (p - center) / sigma : 0
    return { label: d.label, n: d.n, p, z, sigma, ucl: Math.min(1, center + 3 * sigma), lcl: Math.max(0, center - 3 * sigma), rules: [] as SpcRule[] }
  })
  const signals: SpcResult['signals'] = []
  const flag = (i: number, rule: SpcRule) => {
    if (!points[i]!.rules.includes(rule)) {
      points[i]!.rules.push(rule)
      signals.push({ index: i, rule })
    }
  }
  const side = (z: number) => (z > 0 ? 1 : z < 0 ? -1 : 0)
  const on = new Set(rules)
  points.forEach((pt, i) => {
    if (on.has(1) && Math.abs(pt.z) > 3) flag(i, 1)
    // Rules 2 and 3 look back over the window and mark the points that took part, on the signalling side.
    for (const [rule, len, need, limit] of [[2, 3, 2, 2], [3, 5, 4, 1]] as const) {
      if (!on.has(rule) || i < len - 1) continue
      for (const s of [1, -1]) {
        const win = points.slice(i - len + 1, i + 1)
        const hits = win.filter((q) => side(q.z) === s && Math.abs(q.z) > limit)
        if (hits.length >= need && side(pt.z) === s && Math.abs(pt.z) > limit) flag(i, rule)
      }
    }
    if (on.has(4) && i >= 7) {
      const win = points.slice(i - 7, i + 1)
      if (win.every((q) => side(q.z) === 1) || win.every((q) => side(q.z) === -1)) flag(i, 4)
    }
    if (on.has(5) && i >= 5) {
      const win = points.slice(i - 5, i + 1)
      if (win.every((q, k) => k === 0 || q.p > win[k - 1]!.p) || win.every((q, k) => k === 0 || q.p < win[k - 1]!.p)) flag(i, 5)
    }
    if (on.has(6) && i >= 14 && points.slice(i - 14, i + 1).every((q) => Math.abs(q.z) < 1)) flag(i, 6)
    if (on.has(7) && i >= 13) {
      const win = points.slice(i - 13, i + 1)
      const up = win.map((q, k) => (k === 0 ? 0 : Math.sign(q.p - win[k - 1]!.p)))
      if (up.slice(1).every((d, k) => d !== 0 && (k === 0 || d === -up[k]!))) flag(i, 7)
    }
    if (on.has(8) && i >= 7 && points.slice(i - 7, i + 1).every((q) => Math.abs(q.z) > 1)) flag(i, 8)
  })
  signals.sort((a, b) => a.index - b.index || a.rule - b.rule)
  return { center, points, signals }
}

/**
 * Places events, such as a model release or a prompt change from the ledger, on the chart. An event lands on the first
 * point that ended at or after it, so the line sits where the new behaviour could first show. Events outside the range
 * of the points, and any point without a time, are left out rather than put somewhere.
 */
export function markersFromEvents(data: SpcPoint[], events: { at: string; label: string }[]): { at: number; label: string }[] {
  const times = data.map((d) => (d.at ? new Date(d.at).getTime() : NaN))
  if (times.every((t) => Number.isNaN(t))) return []
  const out: { at: number; label: string }[] = []
  for (const e of events) {
    const t = new Date(e.at).getTime()
    if (Number.isNaN(t)) continue
    const i = times.findIndex((x) => !Number.isNaN(x) && x >= t)
    if (i >= 0 && !(i === 0 && t < times[0]! - 1)) out.push({ at: i, label: e.label })
    else if (i === 0) out.push({ at: 0, label: e.label })
  }
  return out
}
