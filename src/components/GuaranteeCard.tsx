import type { GuaranteeCardProps } from '../schemas.js'
import { cx } from './util.js'

const TONE = { honored: 'good', remedied: 'good', pending: undefined, breached: 'bad' } as const
const WORD = { honored: 'Honored', remedied: 'Breached, remedied', pending: 'Pending', breached: 'Breached, remedy outstanding' } as const

export function GuaranteeCard({ id, statement, check, deadlineHours, remedy, status, detail, className }: GuaranteeCardProps & { className?: string }) {
  return (
    <section className={cx('ol', className)} aria-label={id}>
      <div className="ol-head-row">
        <span className="ol-id ol-sub">{id}</span>
        <span className="ol-chips">
          {deadlineHours !== undefined && <span className="ol-pill">{deadlineHours} h</span>}
          <span className="ol-pill" data-tone={TONE[status]}>{WORD[status]}</span>
        </span>
      </div>
      <p className="ol-statement">{statement}</p>
      {detail && <p className="ol-sub" style={{ margin: '0 0 6px' }}>{detail}</p>}
      <p className="ol-remedy"><span className="ol-sub">If missed</span> {remedy}</p>
      <details className="ol-fold"><summary>How it is checked</summary><p>{check}</p></details>
    </section>
  )
}
