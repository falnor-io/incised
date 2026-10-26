import { judgeAutonomy, nextTier, TIERS, type AutonomyCase, type AutonomyRule, type Tier } from './autonomy.js'
import { cx, formatWhen, pct } from './util.js'

export type AutonomyGateProps = {
  title: string
  /** The tier the agent runs at now. */
  tier: Tier
  /** Agent proposals paired with what a person decided. */
  cases: AutonomyCase[]
  /** For example 90% agreement over at least 30 cases. */
  rule: AutonomyRule
  /** How many times this result has been checked. Each look widens the interval. */
  looks?: number
  className?: string
}

/**
 * When an agent has earned more autonomy. It counts how often a person agreed with what the agent proposed, puts an
 * exact interval on it and compares the lower bound with your rule. It says "eligible", never "promoted": a person
 * decides.
 */
export function AutonomyGate({ title, tier, cases, rule, looks = 1, className }: AutonomyGateProps) {
  const j = judgeAutonomy(cases, rule, looks)
  const target = nextTier(tier)
  const level = `${(j.confidence * 100).toFixed(j.confidence >= 0.99 ? 2 : 0)}%`
  const verdict = j.status === 'collecting' ? 'Collecting cases' : j.status === 'stay' ? `Stay at ${tier}` : target ? `Eligible for ${target}` : 'Top tier'
  const tone = j.status === 'ready' ? 'good' : j.status === 'stay' ? 'warn' : undefined
  const weak = j.tasks.filter((t) => t.weak)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={tone}>{verdict}</span>
      </div>
      <ol className="ol-ladder" aria-label="Autonomy tiers">
        {TIERS.map((t) => (
          <li key={t.id} data-state={t.id === tier ? 'current' : t.id === target ? 'target' : undefined} title={`${t.name}. ${t.does}`}>
            <b>{t.id}</b>
            <span>{t.name}</span>
          </li>
        ))}
      </ol>
      <div className="ol-bigfig">
        <b>{pct(j.observed, 0)}</b>
        <span className="ol-sub">{j.agree} of {j.n} agreed, {pct(j.lower, 0)} to {pct(j.upper, 0)} at {level}</span>
      </div>
      <div className="ol-track" role="img" aria-label={`Agreement ${pct(j.observed)}, interval ${pct(j.lower)} to ${pct(j.upper)}, rule ${pct(rule.rate, 0)}`}>
        <span className="ol-band" style={{ left: `${j.lower * 100}%`, width: `${(j.upper - j.lower) * 100}%` }} />
        <span className="ol-mark" style={{ left: `${j.observed * 100}%` }} />
        <span className="ol-mark" data-kind="threshold" style={{ left: `${rule.rate * 100}%` }} />
      </div>
      <p className="ol-sub" style={{ margin: '4px 0 0' }}>{j.reason}</p>
      {j.looks > 1 && <p className="ol-sub" style={{ margin: '4px 0 0' }}>Checked {j.looks} times, so the interval is wider.</p>}
      {weak.length > 0 && (
        <div className="ol-gatelist">
          <p className="ol-sub">Below the rule</p>
          <ul>
            {weak.map((t) => (
              <li key={t.task}><span>{t.task}</span><span className="ol-mono">{t.agree} of {t.n}, {pct(t.observed, 0)}</span></li>
            ))}
          </ul>
        </div>
      )}
      {j.recentOverrides.length > 0 && (
        <div className="ol-gatelist">
          <p className="ol-sub">Overridden</p>
          <ul>
            {j.recentOverrides.map((c) => (
              <li key={c.id}><span>{c.task ?? c.id}</span><span className="ol-sub">{c.at ? formatWhen(c.at) : c.id}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
