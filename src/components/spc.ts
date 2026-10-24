// Statistical process control for a failure rate (a p-chart), with the Western Electric run rules.
// Pure functions, so the maths can be tested and checked by a statistician in one file.

export type SpcPoint = { label: string; failures: number; n: number }
export type SpcRule = 1 | 2 | 3 | 4
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
}

/**
 * p-chart. The centre line comes from the first `baseline` points (all of them by default), pooled so a big
 * sample counts for more than a small one. Limits are per point, because each point has its own sample size.
 */
export function pChart(data: SpcPoint[], baseline = data.length): SpcResult {
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
  points.forEach((pt, i) => {
    if (Math.abs(pt.z) > 3) flag(i, 1)
    // Rules 2 and 3 look back over the window and mark the points that took part, on the signalling side.
    for (const [rule, len, need, limit] of [[2, 3, 2, 2], [3, 5, 4, 1]] as const) {
      if (i < len - 1) continue
      for (const s of [1, -1]) {
        const win = points.slice(i - len + 1, i + 1)
        const hits = win.filter((q) => side(q.z) === s && Math.abs(q.z) > limit)
        if (hits.length >= need && side(pt.z) === s && Math.abs(pt.z) > limit) flag(i, rule)
      }
    }
    if (i >= 7) {
      const win = points.slice(i - 7, i + 1)
      if (win.every((q) => side(q.z) === 1) || win.every((q) => side(q.z) === -1)) flag(i, 4)
    }
  })
  signals.sort((a, b) => a.index - b.index || a.rule - b.rule)
  return { center, points, signals }
}
