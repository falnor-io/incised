import type { GuaranteeCardProps } from '../schemas.js'
import { cx } from './util.js'

const TONE = { honored: 'good', remedied: 'good', pending: undefined, breached: 'bad' } as const
const WORD = { honored: 'Honored', remedied: 'Breached, remedied', pending: 'Pending', breached: 'Breached, remedy outstanding' } as const

export function GuaranteeCard({ id, statement, check, deadlineHours, remedy, status, detail, className }: GuaranteeCardProps & { className?: string }) {
  return (
    <section className={cx('ic', className)} aria-label={id}>
      <div className="ic-head-row">
        <span className="ic-id ic-sub">{id}</span>
        <span className="ic-chips">
          {deadlineHours !== undefined && <span className="ic-pill">{deadlineHours} h</span>}
          <span className="ic-pill" data-tone={TONE[status]}>{WORD[status]}</span>
        </span>
      </div>
      <p className="ic-statement">{statement}</p>
      {detail && <p className="ic-sub" style={{ margin: '0 0 6px' }}>{detail}</p>}
      <p className="ic-remedy"><span className="ic-sub">If missed</span> {remedy}</p>
      <details className="ic-fold"><summary>How it is checked</summary><p>{check}</p></details>
    </section>
  )
}
