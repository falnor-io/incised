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
      <section className={cx('kl', className)} aria-label={label}>
        <strong>{label}</strong>
        <p className="kl-sub">Counts are not valid, so no interval is shown.</p>
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
        ? { tone: 'good' as const, text: `Supports ${pct(threshold, 0)} or better`, why: `The lower bound, ${pct(lower)}, clears the ${pct(threshold, 0)} target.` }
        : { tone: 'warn' as const, text: `Cannot claim ${pct(threshold, 0)}`, why: `The lower bound is ${pct(lower)}, under the ${pct(threshold, 0)} target. More cases would narrow the interval.` }
  return (
    <section className={cx('kl', className)} aria-label={label}>
      <div className="kl-head-row">
        <strong>{label}</strong>
        <span className="kl-sub kl-mono">{passes} of {n}</span>
      </div>
      <div className="kl-bigfig">
        <b>{pct(observed, 0)}</b>
        <span className="kl-sub">{pct(lower, 0)} to {pct(upper, 0)} at {level}</span>
        {claim && <span className="kl-pill" data-tone={claim.tone} title={claim.why}>{claim.text}</span>}
      </div>
      <div className="kl-track" role="img" aria-label={`Observed ${pct(observed)}, ${level} interval ${pct(lower)} to ${pct(upper)}`}>
        <span className="kl-band" style={{ left: `${lower * 100}%`, width: `${(upper - lower) * 100}%` }} />
        <span className="kl-mark" style={{ left: `${observed * 100}%` }} />
        {threshold !== undefined && <span className="kl-mark" data-kind="threshold" style={{ left: `${threshold * 100}%` }} />}
      </div>
      {passes === n && <p className="kl-sub" style={{ margin: '4px 0 0' }} title="Zero failures is a bound, not a guarantee.">No failures, true failure rate under {pct(zeroFailureUpperBound(n, confidence))}</p>}
    </section>
  )
}
