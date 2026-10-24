import type { GuaranteeCardProps } from '../schemas.js'
import { cx } from './util.js'

const TONE = { honored: 'good', remedied: 'good', pending: undefined, breached: 'bad' } as const
const WORD = { honored: 'Honored', remedied: 'Breached, remedy delivered', pending: 'Pending', breached: 'Breached, remedy outstanding' } as const

export function GuaranteeCard({ id, statement, check, deadlineHours, remedy, status, detail, className }: GuaranteeCardProps & { className?: string }) {
  return (
    <section className={cx('ic', className)} aria-label={id}>
      <div className="ic-head-row">
        <span className="ic-mono ic-sub">{id}</span>
        <span className="ic-pill" data-tone={TONE[status]}>{WORD[status]}</span>
      </div>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{statement}</p>
      <dl className="ic-dl">
        <dt>Checked by</dt>
        <dd>{check}</dd>
        {deadlineHours !== undefined && (
          <>
            <dt>Deadline</dt>
            <dd>{deadlineHours} hours</dd>
          </>
        )}
        <dt>If missed</dt>
        <dd>{remedy}</dd>
        {detail && (
          <>
            <dt>Latest</dt>
            <dd>{detail}</dd>
          </>
        )}
      </dl>
    </section>
  )
}
