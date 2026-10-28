import { judgeBudget, type BudgetInput, type BudgetStatus } from './budget.js'
import { amount } from './permissions.js'
import { Count } from './motion.js'
import { unitAffix } from './theatre.js'
import { cx, formatWhen, pct } from './util.js'

export type BudgetMeterProps = BudgetInput & {
  title: string
  className?: string
}

const WORD: Record<BudgetStatus, { word: string; tone: 'good' | 'warn' | 'bad' }> = {
  ok: { word: 'On pace', tone: 'good' },
  watch: { word: 'Close to the limit', tone: 'warn' },
  'over-pace': { word: 'Will run out', tone: 'bad' },
  over: { word: 'Over the limit', tone: 'bad' },
  unreadable: { word: 'Dates unreadable', tone: 'warn' },
}

/**
 * Spend against a limit for a period. The marker shows how much of the period has gone, so a bar that is further
 * along than the marker is ahead of pace. The projection is a straight line you can check with a calculator.
 */
export function BudgetMeter({ title, className, ...input }: BudgetMeterProps) {
  const r = judgeBudget(input)
  const { limit, used, unit } = input
  const tone = WORD[r.status].tone
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-pill" data-tone={r.level === 'critical' ? 'bad' : r.level === 'warn' ? 'warn' : tone}>{WORD[r.status].word}</span>
      </div>
      <div className="ol-budget-fig">
        <span className="ol-budget-used"><Count value={used} digits={2} {...unitAffix(unit)} /></span>
        <span className="ol-sub"> of {amount(limit, unit)}</span>
      </div>
      <div className="ol-budget-track">
        <span
          className="ol-meter"
          role="meter"
          aria-label="Used"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={`${amount(used, unit)} of ${amount(limit, unit)}`}
        >
          <span className="ol-meter-fill" data-tone={r.status === 'ok' ? undefined : tone} style={{ transform: `scaleX(${Math.min(1, r.share)})` }} />
        </span>
        {r.status !== 'unreadable' && <span className="ol-budget-mark" aria-hidden="true" style={{ left: `${r.elapsedShare * 100}%` }} />}
      </div>
      <p className="ol-sub ol-mt-2">{r.text}</p>
      <dl className="ol-budget-facts">
        <div><dt>Period</dt><dd>{formatWhen(input.periodStart).slice(0, 10)} to {formatWhen(input.periodEnd).slice(0, 10)}</dd></div>
        {r.status !== 'unreadable' && <div title="1× uses exactly the limit over the period. 2× runs out in half the time."><dt>Burn rate</dt><dd>{r.burnLong.toFixed(1)}×{input.samples && input.samples.length >= 2 ? `, recent ${r.burnShort.toFixed(1)}×` : ''}</dd></div>}
        {r.status !== 'unreadable' && <div><dt>Left</dt><dd>{pct(r.remainingShare, 0)}</dd></div>}
        {r.status !== 'unreadable' && <div><dt>Gone</dt><dd>{pct(r.elapsedShare, 0)}</dd></div>}
        {r.status !== 'unreadable' && <div><dt>Projected</dt><dd>{amount(Math.round(r.projected * 100) / 100, unit)}</dd></div>}
        {r.runsOutAt && <div><dt>Runs out</dt><dd>{formatWhen(r.runsOutAt)}</dd></div>}
      </dl>
    </section>
  )
}
