import type { CompareProps } from '../schemas.js'
import { cx } from './util.js'

export function Compare({ title, leftLabel, rightLabel, rows, className }: CompareProps & { className?: string }) {
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      <div className="ol-compare" role="table">
        <div className="ol-contents" role="row">
          <div role="columnheader"><span className="ol-sr">Measure</span></div>
          <div role="columnheader">{leftLabel}</div>
          <div role="columnheader">{rightLabel}</div>
        </div>
        {rows.map((row) => (
          <div className="ol-contents" role="row" key={row.label}>
            <div role="rowheader">{row.label}</div>
            <div role="cell">{row.left}</div>
            <div role="cell">{row.right}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
