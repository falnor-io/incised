// Rules for grouping many runs by the path they took. The point of each: "how often did it follow the plan, and how
// often did each path fail" come from counting the runs, and each failure rate carries an exact interval, so a path
// that failed 3 of 4 times is not mistaken for one that failed 300 of 400.
import { clopperPearson } from '../verify/stats.js'

export type VariantRun = { id: string; /** What the run did, in order. */ steps: string[]; failed?: boolean }
export type Variant = {
  key: string
  steps: string[]
  runs: string[]
  count: number
  share: number
  failed: number
  failRate: number
  /** Exact interval on the failure rate. */
  lower: number
  upper: number
  /** `null` when no plan was given. */
  conforms: boolean | null
  missing: string[]
  extra: string[]
  outOfOrder: boolean
}
export type VariantReport = { variants: Variant[]; total: number; conforming: number | null; failed: number; text: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function groupVariants(runs: VariantRun[], plan?: string[], confidence = 0.95): VariantReport {
  const groups = new Map<string, VariantRun[]>()
  for (const r of runs) {
    const key = r.steps.map(norm).join(' > ')
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const planned = plan?.map(norm)
  const variants = [...groups.entries()].map(([key, list]): Variant => {
    const steps = list[0]!.steps
    const have = steps.map(norm)
    const failed = list.filter((r) => r.failed).length
    const iv = clopperPearson(failed, list.length, confidence)
    let missing: string[] = []
    let extra: string[] = []
    let outOfOrder = false
    if (planned) {
      missing = plan!.filter((p) => !have.includes(norm(p)))
      extra = steps.filter((s) => !planned.includes(norm(s)))
      const order = have.filter((h) => planned.includes(h)).map((h) => planned.indexOf(h))
      outOfOrder = order.some((v, i) => i > 0 && v < order[i - 1]!)
    }
    return {
      key, steps, runs: list.map((r) => r.id), count: list.length, share: runs.length ? list.length / runs.length : 0, failed,
      failRate: failed / list.length, lower: iv.lower, upper: iv.upper,
      conforms: planned ? missing.length === 0 && extra.length === 0 && !outOfOrder : null, missing, extra, outOfOrder,
    }
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  const failed = runs.filter((r) => r.failed).length
  const conforming = planned ? variants.filter((v) => v.conforms).reduce((n, v) => n + v.count, 0) : null
  const text = runs.length === 0
    ? 'No runs.'
    : `${runs.length} ${runs.length === 1 ? 'run' : 'runs'} took ${variants.length} ${variants.length === 1 ? 'path' : 'different paths'}.` +
      (conforming !== null ? ` ${conforming} followed the plan.` : '') +
      (failed ? ` ${failed} failed.` : '')
  return { variants, total: runs.length, conforming, failed, text }
}
