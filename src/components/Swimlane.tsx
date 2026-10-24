import { Fragment } from 'react'
import type { SwimlaneProps } from '../schemas.js'
import { cx } from './util.js'

export function Swimlane({ title, lanes, className }: SwimlaneProps & { className?: string }) {
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <h3 className="ic-title">{title}</h3>
      {lanes.map((lane) => (
        <div className="ic-lane" key={lane.owner}>
          <div className="ic-lane-owner">{lane.owner}</div>
          <ol className="ic-list ic-steps">
            {lane.steps.map((step, i) => (
              <Fragment key={`${step.name}-${i}`}>
                {i > 0 && <li className="ic-arrow" aria-hidden="true">→</li>}
                <li className="ic-step" data-waiting={step.waiting ? 'true' : 'false'}>
                  {step.name}
                  {step.waiting && <span className="ic-sub"> · waits</span>}
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
