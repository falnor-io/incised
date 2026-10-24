import { Fragment } from 'react'
import type { SwimlaneProps } from '../schemas.js'
import { cx } from './util.js'

export function Swimlane({ title, lanes, className }: SwimlaneProps & { className?: string }) {
  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      {lanes.map((lane) => (
        <div className="kl-lane" key={lane.owner}>
          <div className="kl-lane-owner">{lane.owner}</div>
          <ol className="kl-list kl-steps">
            {lane.steps.map((step, i) => (
              <Fragment key={`${step.name}-${i}`}>
                {i > 0 && <li className="kl-arrow" aria-hidden="true">→</li>}
                <li className="kl-step" data-waiting={step.waiting ? 'true' : 'false'}>
                  {step.name}
                  {step.waiting && <span className="kl-sub"> · waits</span>}
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
