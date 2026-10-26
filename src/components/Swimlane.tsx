import { Fragment } from 'react'
import { after } from './theatre.js'
import type { SwimlaneProps } from '../schemas.js'
import { cx } from './util.js'

export function Swimlane({ title, lanes, className }: SwimlaneProps & { className?: string }) {
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      {lanes.map((lane, li) => (
        <div className="ol-lane ol-in" style={after(li)} key={lane.owner}>
          <div className="ol-lane-owner">{lane.owner}</div>
          <ol className="ol-list ol-steps">
            {lane.steps.map((step, i) => (
              <Fragment key={`${step.name}-${i}`}>
                {i > 0 && <li className="ol-arrow" aria-hidden="true">→</li>}
                <li className="ol-step ol-in" style={after(li + i)} data-waiting={step.waiting ? 'true' : 'false'}>
                  {step.name}
                  {step.waiting && <span className="ol-sub"> · waits</span>}
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
