import { amount, judgeGrants, type Grant, type GrantStatus } from './permissions.js'
import { cx, formatWhen } from './util.js'

export type PermissionGrantProps = {
  title: string
  grants: Grant[]
  /** Fixed clock for the verdicts. Defaults to the current time. */
  now?: string
  className?: string
}

const MONEY = ['USD', 'GBP', 'EUR']
/** "$12,400 of $15,000" for money, "58 of 50 emails" for anything else. */
const usageText = (used: number, limit: number, unit: string) =>
  MONEY.includes(unit) ? `${amount(used, unit)} of ${amount(limit, unit)}` : `${used.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} ${unit}`

const WORD: Record<GrantStatus, { word: string; tone?: 'good' | 'warn' | 'bad' }> = {
  active: { word: 'In force', tone: 'good' },
  expiring: { word: 'Expiring', tone: 'warn' },
  exhausted: { word: 'Used up', tone: 'warn' },
  over: { word: 'Over the limit', tone: 'bad' },
  expired: { word: 'Expired' },
  revoked: { word: 'Revoked' },
}

/**
 * What an agent is allowed to do, how much of each allowance is left and when it ends. Status comes from the grant,
 * the clock and what has been used, so a grant the agent describes as current is still shown as expired if it is.
 */
export function PermissionGrant({ title, grants, now, className }: PermissionGrantProps) {
  const { rows, summary } = judgeGrants(grants, now)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-sub">{summary.text}</span>
      </div>
      {rows.length === 0 ? (
        <p className="ol-sub" style={{ margin: 0 }}>No grants. The agent is not allowed to do anything.</p>
      ) : (
        <ul className="ol-grants" aria-label="Grants">
          {rows.map(({ grant: g, status, share, why }) => (
            <li key={g.id} className="ol-grant" data-status={status}>
              <div className="ol-grant-main">
                <span className="ol-id">{g.scope}</span>
                {g.resource && <span className="ol-sub"> on {g.resource}</span>}
                <span className="ol-sub ol-grant-by">Granted by {g.grantedBy}, {formatWhen(g.grantedAt)}{g.expiresAt ? `, ends ${formatWhen(g.expiresAt)}` : ''}</span>
              </div>
              <span className="ol-pill" data-tone={WORD[status].tone}>{WORD[status].word}</span>
              {g.limit && share !== undefined ? (
                <div className="ol-grant-use">
                  <span
                    className="ol-meter"
                    role="meter"
                    aria-label={`${g.scope} used`}
                    aria-valuemin={0}
                    aria-valuemax={g.limit.amount}
                    aria-valuenow={Math.min(g.used ?? 0, g.limit.amount)}
                    aria-valuetext={`${amount(g.used ?? 0, g.limit.unit)} of ${amount(g.limit.amount, g.limit.unit)}`}
                  >
                    <span className="ol-meter-fill" data-tone={status === 'over' ? 'bad' : share >= 0.85 ? 'warn' : undefined} style={{ width: `${Math.min(100, share * 100)}%` }} />
                  </span>
                  <span className="ol-sub">{usageText(g.used ?? 0, g.limit.amount, g.limit.unit)}{g.limit.period === 'total' ? '' : ` per ${g.limit.period}`}</span>
                </div>
              ) : (
                <span />
              )}
              <p className="ol-sub ol-grant-why">{why}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
