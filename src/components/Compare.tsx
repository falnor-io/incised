import type { CompareProps } from '../schemas.js'
import { cx } from './util.js'

export function Compare({ title, leftLabel, rightLabel, rows, className }: CompareProps & { className?: string }) {
  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      <div className="kl-compare" role="table">
        <div className="kl-head" role="columnheader" />
        <div className="kl-head" role="columnheader">{leftLabel}</div>
        <div className="kl-head" role="columnheader">{rightLabel}</div>
        {rows.map((row) => (
          <div style={{ display: 'contents' }} role="row" key={row.label}>
            <div className="kl-label" role="rowheader">{row.label}</div>
            <div role="cell">{row.left}</div>
            <div role="cell">{row.right}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
