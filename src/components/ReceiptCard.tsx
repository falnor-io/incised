import type { ReceiptCardProps } from '../schemas.js'
import { cx, formatWhen } from './util.js'

/** A signed receipt for one action. Signature validity comes from your verifier, passed in as `signers`. */
export function ReceiptCard({ title, issuedAt, rows, hash, signers, className }: ReceiptCardProps & { className?: string }) {
  const allValid = signers.every((s) => s.valid)
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
        <span className="ic-pill" data-tone={allValid ? 'good' : 'bad'}>{allValid ? 'signatures valid' : 'signature problem'}</span>
      </div>
      <p className="ic-sub" style={{ margin: '0 0 8px' }}>Issued {formatWhen(issuedAt)}</p>
      <dl className="ic-dl">
        {rows.map((r) => (
          <div style={{ display: 'contents' }} key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="ic-receipt-foot">
        <div className="ic-id ic-sub" style={{ wordBreak: 'break-all' }}>{hash}</div>
        <div className="ic-chips">{signers.map((s) => <span className="ic-pill" key={s.party} data-tone={s.valid ? 'good' : 'bad'}>{s.party}: {s.valid ? 'valid' : 'invalid'}</span>)}</div>
      </div>
    </section>
  )
}
