import type { BottlenecksProps } from '../schemas.js'
import { cx } from './util.js'

export function Bottlenecks({ title, unit, items, className }: BottlenecksProps & { className?: string }) {
  const max = Math.max(...items.map((i) => i.amount), 0)
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <h3 className="ic-title">{title}</h3>
      {items.map((item) => (
        <div className="ic-row" key={item.stage}>
          <span>{item.stage}</span>
          <div className="ic-bar" role="img" aria-label={`${item.stage}: ${item.amount} ${unit}`}>
            <span style={{ width: `${max > 0 ? (item.amount / max) * 100 : 0}%` }} data-top={max > 0 && item.amount === max ? 'true' : 'false'} />
          </div>
          <span className="ic-mono">{item.amount} {unit}</span>
        </div>
      ))}
    </section>
  )
}
