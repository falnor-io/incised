import { judgeView, type ViewReceiptRow } from './viewreceipt.js'
import { cx, formatWhen } from './util.js'

export type ViewReceiptCardProps = ViewReceiptRow & { title?: string; className?: string }

/**
 * One receipt of what a person was shown: which component, which record, to whom, when, and the hash of the data drawn.
 * The verdict comes from the checks you pass in, so a receipt that nobody checked reads as "Not checked".
 */
export function ViewReceiptCard({ receipt, signatureValid, dataMatches, title = 'Shown to reviewer', className }: ViewReceiptCardProps) {
  const v = judgeView({ receipt, signatureValid, dataMatches })
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-pill" data-tone={v.tone}>{v.word}</span>
      </div>
      <p className="ol-sub ol-mb-3">{v.text}</p>
      <dl className="ol-kv">
        <dt>Component</dt><dd>{receipt.component}</dd>
        <dt>Record</dt><dd><span className="ol-id">{receipt.kind}/{receipt.source}</span></dd>
        <dt>Shown to</dt><dd>{receipt.by}</dd>
        <dt>When</dt><dd>{formatWhen(receipt.shownAt)}</dd>
        <dt>Data hash</dt><dd><span className="ol-id" title="SHA-256 of the data that was drawn">{receipt.dataHash.slice(0, 12)}</span></dd>
        {receipt.planHash && <><dt>Plan hash</dt><dd><span className="ol-id">{receipt.planHash.slice(0, 12)}</span></dd></>}
      </dl>
    </section>
  )
}
