'use client'

import type { FunnelProps } from '../schemas.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { gateFor, pendingRow, type Status } from './status.js'
import { Count } from './motion.js'
import { after } from './theatre.js'
import { cx, pct } from './util.js'

const ROW = 48

/**
 * How many make it through each step, drawn as a funnel. Each step is a band as wide as its count, and the band narrows
 * into the next step, so the drop shows as a shape as well as a number. The share kept at each step is computed here.
 */
export function Funnel({ title, unit, steps, playable = false, param, status, className }: FunnelProps & { playable?: boolean; param?: string; status?: Status; className?: string }) {
  const pb = usePlayback(steps.length, { param })
  const gate = gateFor(status, { title, className })
  if (gate) return gate
  const first = steps[0]?.value ?? 0
  const last = steps[steps.length - 1]?.value ?? 0
  const share = (v: number) => (first > 0 ? v / first : 0)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title} aria-busy={status === 'partial' || undefined}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-pill">{playable ? `${pct(share(steps[pb.at]?.value ?? 0), 0)} still in at step ${pb.at + 1}` : `${pct(share(last), 0)} reach the end`}</span>
      </div>
      <ol className="ol-funnel">
        {steps.map((step, i) => {
          const prev = steps[i - 1]?.value
          const kept = prev && prev > 0 ? step.value / prev : null
          const top = Math.max(share(step.value), 0.06) * 100
          const next = steps[i + 1]?.value
          const bottom = next !== undefined ? Math.max(Math.min(share(next), share(step.value)), 0.06) * 100 : top * 0.72
          const tone = `color-mix(in srgb, var(--ol-accent) ${Math.max(35, 100 - i * 18)}%, var(--ol-bg))`
          const label = `${step.label}: ${step.value} ${unit}${kept !== null ? `, ${pct(kept, 0)} kept from the step before` : ''}`
          return (
            <li key={step.label} className="ol-frow ol-in" style={after(i)} data-ahead={playable && i > pb.at ? 'true' : undefined} aria-label={label}>
              <span className="ol-flabel">{step.label}</span>
              <svg className="ol-fshape" viewBox={`0 0 100 ${ROW}`} preserveAspectRatio="none" aria-hidden="true">
                <polygon points={`${50 - top / 2},0 ${50 + top / 2},0 ${50 + bottom / 2},${ROW} ${50 - bottom / 2},${ROW}`} style={{ fill: tone }} />
              </svg>
              <span className="ol-fval">
                <span className="ol-mono"><Count value={step.value} /> {unit}</span>
                {kept !== null && <span className="ol-kept"><Count value={kept * 100} suffix="%" /> kept</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {pendingRow(status)}
      {playable && steps.length > 1 && <PlaybackBar pb={pb} count={steps.length} label={title} />}
    </section>
  )
}
