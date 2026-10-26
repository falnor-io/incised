import { TIERS } from './autonomy.js'
import { judgeFleet, type FleetAgent } from './fleet.js'
import { cx, pct } from './util.js'

export type AutonomyBoardProps = {
  title: string
  agents: FleetAgent[]
  /** Fixed clock for the verdicts. Defaults to the current time. */
  now?: string
  className?: string
}

/**
 * Every agent in one list: its tier, whether a person's agreement with it has earned a higher one, what its grants
 * and budget look like, and anything that needs a look. Each row is worked out from that agent's own cases, grants
 * and budget, and the eligible tag is a prompt for a person, not a promotion.
 */
export function AutonomyBoard({ title, agents, now, className }: AutonomyBoardProps) {
  const { rows, summary } = judgeFleet(agents, now)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-sub">{summary.text}</span>
      </div>
      {rows.length === 0 ? (
        <p className="ol-sub" style={{ margin: 0 }}>No agents.</p>
      ) : (
        <ul className="ol-fleetlist" aria-label="Agents">
          {rows.map((r) => {
            const a = r.autonomy
            const tier = TIERS.find((t) => t.id === r.agent.tier)
            return (
              <li key={r.agent.id} className="ol-fleetrow" data-flag={r.flags.some((f) => f.severity === 'bad') ? 'bad' : r.flags.length ? 'warn' : undefined}>
                <div className="ol-fleetname">
                  <strong>{r.agent.name}</strong>
                  <span className="ol-sub">{r.agent.tier} {tier?.name}</span>
                </div>
                <div className="ol-fleetgate">
                  <span className="ol-pill" data-tone={r.eligibleFor ? 'good' : r.demoteTo ? 'bad' : a.status === 'stay' ? 'warn' : undefined}>
                    {r.eligibleFor ? `Eligible for ${r.eligibleFor}` : r.demoteTo ? `Step down to ${r.demoteTo}` : a.status === 'collecting' ? 'Collecting cases' : a.status === 'stay' ? `Stay at ${r.agent.tier}` : 'Top tier'}
                  </span>
                  <span className="ol-sub">{a.n > 0 ? `${pct(a.observed, 0)} agreed, ${a.agree} of ${a.n}` : 'No cases yet'}</span>
                </div>
                <div className="ol-fleetnote">
                  {r.flags.length === 0 ? (
                    <span className="ol-sub">{r.grants ? r.grants.text : 'Nothing flagged.'}</span>
                  ) : (
                    r.flags.map((f) => <span key={f.kind + f.text} className="ol-pill" data-tone={f.severity}>{f.text}</span>)
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
