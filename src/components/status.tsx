import type { ReactNode } from 'react'
import { cx } from './util.js'

/**
 * Where a piece of generated UI is in its life, so a component can be placed before its data is whole.
 * `loading`: nothing yet, show a skeleton of the same height. `partial`: some data has arrived, show it and mark the
 * rest as still coming. `ready`: all of it. `error`: it will not arrive. Follows the stages a streamed tool call goes through.
 */
export type Status = 'loading' | 'partial' | 'ready' | 'error'

/** What to draw instead of the component while it has nothing to show. Returns null when the component should draw itself. */
export function gateFor(status: Status | undefined, o: { title: string; className?: string; rows?: number; error?: string }): ReactNode | null {
  if (status === 'loading') {
    return (
      <section role="group" className={cx('ol', className(o))} aria-label={o.title} aria-busy="true">
        <h3 className="ol-title">{o.title}</h3>
        <div className="ol-skel" aria-hidden="true">{Array.from({ length: o.rows ?? 3 }, (_, i) => <span key={i} className="ol-skelrow" />)}</div>
        <p className="ol-sub">Loading</p>
      </section>
    )
  }
  if (status === 'error') {
    return (
      <section role="group" className={cx('ol', className(o))} aria-label={o.title}>
        <h3 className="ol-title">{o.title}</h3>
        <p className="ol-text-bad" role="alert">{o.error ?? 'This could not be loaded.'}</p>
      </section>
    )
  }
  return null
}

const className = (o: { className?: string }) => o.className

/** A trailing row that says more is on the way. Rendered only while a component is partial. */
export function pendingRow(status: Status | undefined): ReactNode {
  return status === 'partial' ? <p className="ol-sub ol-pending" role="status">More is on the way</p> : null
}
