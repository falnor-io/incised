import type { TrailProps } from '../schemas.js'
import { cx } from './util.js'

/** One request traced stop by stop. The total wait is computed here, never taken from the model. */
export function Trail({ title, request, stops, className }: TrailProps & { className?: string }) {
  const total = stops.reduce((sum, s) => sum + s.waitDays, 0)
  return (
    <section className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      <p className="ol-sub" style={{ margin: '-6px 0 12px' }}>
        {request} · waits {total} {total === 1 ? 'day' : 'days'} across {stops.length} stops
      </p>
      <ol className="ol-list">
        {stops.map((stop, i) => (
          <li className="ol-stop" key={`${stop.name}-${i}`}>
            <span className="ol-dot" data-wait={stop.waitDays > 0 ? 'true' : 'false'} aria-hidden="true" />
            <div>
              <div>
                <strong>{stop.name}</strong> <span className="ol-sub">{stop.owner}</span>
              </div>
              <div className="ol-sub">{stop.note}</div>
            </div>
            {stop.waitDays > 0 ? (
              <span className="ol-pill" data-tone="warn">waits {stop.waitDays}d</span>
            ) : (
              <span className="ol-pill">no wait</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
