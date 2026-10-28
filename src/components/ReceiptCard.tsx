import type { ReceiptCardProps } from '../schemas.js'
import { cx, formatWhen } from './util.js'

/** A signed receipt for one action. Signature validity comes from your verifier, passed in as `signers`. */
export function ReceiptCard({ title, issuedAt, rows, hash, signers, className }: ReceiptCardProps & { className?: string }) {
  const allValid = signers.every((s) => s.valid)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-pill" data-tone={allValid ? 'good' : 'bad'}>{allValid ? 'signatures valid' : 'signature problem'}</span>
      </div>
      <p className="ol-sub ol-mb-3">Issued {formatWhen(issuedAt)}</p>
      <dl className="ol-dl">
        {rows.map((r) => (
          <div className="ol-contents" key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="ol-receipt-foot">
        <div className="ol-id ol-sub ol-break">{hash}</div>
        <div className="ol-chips">{signers.map((s) => <span className="ol-pill" key={s.party} data-tone={s.valid ? 'good' : 'bad'}>{s.party}: {s.valid ? 'valid' : 'invalid'}</span>)}</div>
      </div>
    </section>
  )
}
