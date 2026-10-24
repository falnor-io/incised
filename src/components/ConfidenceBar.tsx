import type { ConfidenceBarProps } from '../schemas.js'
import { clopperPearson, zeroFailureUpperBound } from '../verify/stats.js'
import { cx, pct } from './util.js'

/**
 * An observed pass rate with its exact interval. The interval and the verdict are computed here from
 * passes and n alone. A small n gives a wide band, which is the point: 50 cases never prove 90%.
 */
export function ConfidenceBar({ label, passes, n, confidence = 0.95, threshold, className }: ConfidenceBarProps & { className?: string }) {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(passes) || passes < 0 || passes > n) {
    return (
      <section className={cx('ic', className)} aria-label={label}>
        <strong>{label}</strong>
        <p className="ic-sub">Counts are not valid, so no interval is shown.</p>
      </section>
    )
  }
  const { lower, upper } = clopperPearson(passes, n, confidence)
  const observed = passes / n
  const level = `${Math.round(confidence * 100)}%`
  const claim =
    threshold === undefined
      ? null
      : lower >= threshold
        ? { tone: 'good' as const, text: `Evidence supports a pass rate of at least ${pct(threshold, 0)}.` }
        : { tone: 'warn' as const, text: `Not enough evidence to claim at least ${pct(threshold, 0)}. The lower bound is ${pct(lower)}.` }
  return (
    <section className={cx('ic', className)} aria-label={label}>
      <div className="ic-head-row">
        <strong>{label}</strong>
        <span className="ic-mono">{passes}/{n}</span>
      </div>
      <div className="ic-track" role="img" aria-label={`Observed ${pct(observed)}, ${level} interval ${pct(lower)} to ${pct(upper)}`}>
        <span className="ic-band" style={{ left: `${lower * 100}%`, width: `${(upper - lower) * 100}%` }} />
        <span className="ic-mark" style={{ left: `${observed * 100}%` }} />
        {threshold !== undefined && <span className="ic-mark" data-kind="threshold" style={{ left: `${threshold * 100}%` }} />}
      </div>
      <p style={{ margin: '0 0 4px' }}>
        Observed {pct(observed)}. True rate is between {pct(lower)} and {pct(upper)} at {level} confidence.
      </p>
      {passes === n && <p className="ic-sub" style={{ margin: '0 0 4px' }}>No failures in {n} cases: the true failure rate is below {pct(zeroFailureUpperBound(n, confidence))} at {level} confidence. That is not "cannot happen".</p>}
      {claim && <span className="ic-pill" data-tone={claim.tone}>{claim.text}</span>}
    </section>
  )
}
