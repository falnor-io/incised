// Exact binomial machinery in log space, stable for n in the thousands. Ported from the failure calculus
// so a client statistician can audit it in one file.

const logFactCache: number[] = [0, 0]
function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = (logFactCache[i - 1] ?? 0) + Math.log(i)
  return logFactCache[n] ?? 0
}
const logChoose = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k)

function binomPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0
  if (p >= 1) return k === n ? 1 : 0
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))
}
function binomCdf(k: number, n: number, p: number): number {
  let s = 0
  for (let i = 0; i <= k; i++) s += binomPmf(i, n, p)
  return Math.min(1, s)
}
const binomTailGE = (k: number, n: number, p: number) => (k <= 0 ? 1 : 1 - binomCdf(k - 1, n, p))

export type Interval = { lower: number; upper: number }

/** Clopper-Pearson exact interval for passes out of n, found by bisection on the binomial CDF. */
export function clopperPearson(passes: number, n: number, confidence = 0.95): Interval {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer')
  if (!Number.isInteger(passes) || passes < 0 || passes > n) throw new RangeError('passes must be an integer from 0 to n')
  const alpha = 1 - confidence
  const bisect = (isLow: (p: number) => boolean) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2
      if (isLow(mid)) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const lower = passes === 0 ? 0 : bisect((p) => binomTailGE(passes, n, p) <= alpha / 2)
  const upper = passes === n ? 1 : bisect((p) => binomCdf(passes, n, p) > alpha / 2)
  return { lower, upper }
}

/** Upper bound on the true failure rate when zero failures were seen in n cases: 1 - alpha^(1/n). */
export function zeroFailureUpperBound(n: number, confidence = 0.95): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer')
  return 1 - Math.pow(1 - confidence, 1 / n)
}
