import type { GuaranteeCardProps } from '../schemas.js'
import { cx } from './util.js'

const TONE = { honored: 'good', remedied: 'good', pending: undefined, breached: 'bad' } as const
const WORD = { honored: 'Honored', remedied: 'Breached, remedied', pending: 'Pending', breached: 'Breached, remedy outstanding' } as const

export function GuaranteeCard({ id, statement, check, deadlineHours, remedy, status, detail, className }: GuaranteeCardProps & { className?: string }) {
  return (
    <section className={cx('kl', className)} aria-label={id}>
      <div className="kl-head-row">
        <span className="kl-id kl-sub">{id}</span>
        <span className="kl-chips">
          {deadlineHours !== undefined && <span className="kl-pill">{deadlineHours} h</span>}
          <span className="kl-pill" data-tone={TONE[status]}>{WORD[status]}</span>
        </span>
      </div>
      <p className="kl-statement">{statement}</p>
      {detail && <p className="kl-sub" style={{ margin: '0 0 6px' }}>{detail}</p>}
      <p className="kl-remedy"><span className="kl-sub">If missed</span> {remedy}</p>
      <details className="kl-fold"><summary>How it is checked</summary><p>{check}</p></details>
    </section>
  )
}
