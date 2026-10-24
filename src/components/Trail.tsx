import type { TrailProps } from '../schemas.js'
import { cx } from './util.js'

/** One request traced stop by stop. The total wait is computed here, never taken from the model. */
export function Trail({ title, request, stops, className }: TrailProps & { className?: string }) {
  const total = stops.reduce((sum, s) => sum + s.waitDays, 0)
  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      <p className="kl-sub" style={{ margin: '-6px 0 12px' }}>
        {request} · waits {total} {total === 1 ? 'day' : 'days'} across {stops.length} stops
      </p>
      <ol className="kl-list">
        {stops.map((stop, i) => (
          <li className="kl-stop" key={`${stop.name}-${i}`}>
            <span className="kl-dot" data-wait={stop.waitDays > 0 ? 'true' : 'false'} aria-hidden="true" />
            <div>
              <div>
                <strong>{stop.name}</strong> <span className="kl-sub">{stop.owner}</span>
              </div>
              <div className="kl-sub">{stop.note}</div>
            </div>
            {stop.waitDays > 0 ? (
              <span className="kl-pill" data-tone="warn">waits {stop.waitDays}d</span>
            ) : (
              <span className="kl-pill">no wait</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
