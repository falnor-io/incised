'use client'

import type { TrailProps } from '../schemas.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { gateFor, pendingRow, type Status } from './status.js'
import { after } from './theatre.js'
import { cx } from './util.js'

/**
 * One request traced stop by stop. The total wait is computed here, never taken from the model. With `playable`, the
 * trail replays: stops past the playhead wait dimmed and the wait counted so far runs up to the total.
 */
export function Trail({ title, request, stops, playable = false, param, status, className }: TrailProps & { playable?: boolean; param?: string; status?: Status; className?: string }) {
  const total = stops.reduce((sum, s) => sum + s.waitDays, 0)
  const pb = usePlayback(stops.length, { param })
  const sofar = stops.slice(0, pb.at + 1).reduce((sum, s) => sum + s.waitDays, 0)
  const gate = gateFor(status, { title, className })
  if (gate) return gate
  const unit = (n: number) => (n === 1 ? 'day' : 'days')
  return (
    <section role="group" className={cx('ol', className)} aria-label={title} aria-busy={status === 'partial' || undefined}>
      <h3 className="ol-title">{title}</h3>
      <p className="ol-sub ol-trail-sub">
        {request} · {playable ? `${sofar} of ${total} ${unit(total)} waited at stop ${pb.at + 1}` : `waits ${total} ${unit(total)} across ${stops.length} stops`}
      </p>
      <ol className="ol-list">
        {stops.map((stop, i) => (
          <li className="ol-stop ol-in" style={after(i)} data-annotate={`stop-${i}`} data-ahead={playable && i > pb.at ? 'true' : undefined} aria-current={playable && i === pb.at ? 'step' : undefined} key={`${stop.name}-${i}`}>
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
      {pendingRow(status)}
      {playable && stops.length > 1 && <PlaybackBar pb={pb} count={stops.length} label={title} />}
    </section>
  )
}
