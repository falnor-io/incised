import { Fragment } from 'react'
import type { SwimlaneProps } from '../schemas.js'
import { cx } from './util.js'

export function Swimlane({ title, lanes, className }: SwimlaneProps & { className?: string }) {
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      {lanes.map((lane) => (
        <div className="ol-lane" key={lane.owner}>
          <div className="ol-lane-owner">{lane.owner}</div>
          <ol className="ol-list ol-steps">
            {lane.steps.map((step, i) => (
              <Fragment key={`${step.name}-${i}`}>
                {i > 0 && <li className="ol-arrow" aria-hidden="true">→</li>}
                <li className="ol-step" data-waiting={step.waiting ? 'true' : 'false'}>
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
