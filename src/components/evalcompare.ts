// Rules for comparing two evaluation runs on the same cases. The point of each: a drop is called a regression only
// when the flips are too lopsided to be chance, and when there are too few flips to ever tell, the page says so
// instead of colouring a number red.
import { mcnemarExact } from '../verify/stats.js'

export type EvalCase = { id: string; label: string }
export type EvalRun = { label: string; results: Record<string, boolean> }
export type Flip = 'regressed' | 'improved'
export type RunComparison = {
  regressed: number
  improved: number
  unchanged: number
  p: number
  /** The fewest flips, all one way, that could ever reach p under 0.05. Fewer than this can never be shown to be real. */
  flipsNeeded: number
  flips: Map<string, Flip>
  verdict: 'same-run' | 'no-change' | 'regression' | 'possible-drift' | 'improvement' | 'possible-gain' | 'mixed'
  text: string
}

/** Smallest n with 2 * 0.5^n under 0.05, which is when one-sided flips can first reach significance. */
export const flipsNeededFor = (alpha = 0.05) => Math.ceil(Math.log2(2 / alpha))

export function compareRuns(cases: EvalCase[], base: EvalRun, cand: EvalRun, same = false): RunComparison {
  const flips = new Map<string, Flip>()
  let regressed = 0
  let improved = 0
  for (const c of cases) {
    const a = base.results[c.id] === true
    const b = cand.results[c.id] === true
    if (a && !b) (regressed++, flips.set(c.id, 'regressed'))
    if (!a && b) (improved++, flips.set(c.id, 'improved'))
  }
  const p = mcnemarExact(regressed, improved)
  const unchanged = cases.length - regressed - improved
  const flipsNeeded = flipsNeededFor()
  const n = regressed + improved
  const counts = `${regressed} worse, ${improved} better`
  let verdict: RunComparison['verdict']
  let text: string
  if (same) { verdict = 'same-run'; text = 'Pick two different runs to compare.' }
  else if (n === 0) { verdict = 'no-change'; text = 'No case changed.' }
  else if (regressed > improved) {
    if (p < 0.05) { verdict = 'regression'; text = `Regression: ${counts}. Too lopsided to be chance (p ${p < 0.001 ? '< 0.001' : '= ' + p.toFixed(3)}).` }
    else { verdict = 'possible-drift'; text = `Possible drift: ${counts}. This could be chance (p = ${p.toFixed(2)}).${n < flipsNeeded ? ` With ${n} ${n === 1 ? 'case' : 'cases'} flipped it cannot be shown either way: it takes at least ${flipsNeeded}, all one way.` : ''}` }
  } else if (improved > regressed) {
    if (p < 0.05) { verdict = 'improvement'; text = `Improvement: ${counts}. Too lopsided to be chance (p ${p < 0.001 ? '< 0.001' : '= ' + p.toFixed(3)}).` }
    else { verdict = 'possible-gain'; text = `Possible gain: ${counts}. This could be chance (p = ${p.toFixed(2)}).${n < flipsNeeded ? ` With ${n} ${n === 1 ? 'case' : 'cases'} flipped it cannot be shown either way: it takes at least ${flipsNeeded}, all one way.` : ''}` }
  } else { verdict = 'mixed'; text = `${counts}. The same number moved each way, so nothing net changed.` }
  return { regressed, improved, unchanged, p, flipsNeeded, flips, verdict, text }
}
