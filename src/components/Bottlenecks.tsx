import type { BottlenecksProps } from '../schemas.js'
import { cx } from './util.js'
import { after } from './theatre.js'

export function Bottlenecks({ title, unit, items, className }: BottlenecksProps & { className?: string }) {
  const max = Math.max(...items.map((i) => i.amount), 0)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      {items.map((item, idx) => (
        <div className="ol-row ol-in" style={after(idx)} key={item.stage}>
          <span>{item.stage}</span>
          <div className="ol-bar" role="img" aria-label={`${item.stage}: ${item.amount} ${unit}`}>
            <span className="ol-grow" style={{ width: `${max > 0 ? (item.amount / max) * 100 : 0}%`, ...after(idx) }} data-top={max > 0 && item.amount === max ? 'true' : 'false'} />
          </div>
          <span className="ol-mono">{item.amount} {unit}</span>
        </div>
      ))}
    </section>
  )
}
