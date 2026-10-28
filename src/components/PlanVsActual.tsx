import { alignPlan, type ActualStep, type PlanStep, type StepState } from './planactual.js'
import { cx } from './util.js'
import { after } from './theatre.js'

export type PlanVsActualProps = {
  title: string
  plan: PlanStep[]
  actual: ActualStep[]
  className?: string
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const STATE: Record<StepState, { word: string; tone?: 'good' | 'warn' | 'bad' }> = {
  done: { word: 'Done', tone: 'good' },
  failed: { word: 'Failed', tone: 'bad' },
  blocked: { word: 'Blocked', tone: 'warn' },
  skipped: { word: 'Not run', tone: 'warn' },
}

/**
 * What the agent said it would do next to what it did. Skipped, failed, blocked, out-of-order and unplanned steps are
 * found by comparing the two lists, so the agent's own account of its run never decides the result.
 */
export function PlanVsActual({ title, plan, actual, className }: PlanVsActualProps) {
  const r = alignPlan(plan, actual)
  const c = r.counts
  const facts: [string, number, 'good' | 'warn' | 'bad' | undefined][] = [
    ['as planned', c.asPlanned, 'good'], ['not run', c.skipped, 'warn'], ['failed', c.failed, 'bad'],
    ['blocked', c.blocked, 'warn'], ['out of order', c.outOfOrder, 'warn'], ['not in the plan', c.extra, 'warn'],
  ]
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-chips">
          {facts.filter(([, n]) => n > 0).map(([label, n, tone]) => <span key={label} className="ol-pill" data-tone={tone}>{n} {label}</span>)}
        </span>
      </div>
      <p className="ol-sub ol-mb-2">{r.summary}</p>
      {r.rows.length > 0 && (
        <ol className="ol-pva" aria-label="Planned steps">
          {r.rows.map((row, i) => (
            <li key={row.plan.id} className="ol-pvarow ol-in" style={after(i)} data-state={row.state}>
              <span><span className="ol-sub ol-mono">{i + 1}</span> {row.plan.action}</span>
              <span className="ol-pill" data-tone={STATE[row.state].tone}>{STATE[row.state].word}{row.outOfOrder ? ', late' : ''}</span>
              <span className="ol-pvaact">{row.actual ? (same(row.actual.action, row.plan.action) ? `Ran as step ${row.ranAs}` : `Ran as step ${row.ranAs}: ${row.actual.action}`) : 'Did not run'}</span>
            </li>
          ))}
        </ol>
      )}
      {r.extras.length > 0 && (
        <ul className="ol-pva" aria-label="Steps not in the plan">
          {r.extras.map((e) => (
            <li key={e.id} className="ol-pvarow" data-state="extra">
              <span className="ol-sub">Not planned</span>
              <span className="ol-pill" data-tone={e.status === 'ok' ? 'warn' : 'bad'}>{e.status === 'ok' ? 'Ran' : e.status === 'error' ? 'Failed' : 'Blocked'}</span>
              <span className="ol-pvaact">{e.action}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
