'use client'

import { Fragment, useEffect, useState, type KeyboardEvent } from 'react'
import { useWidth } from './hooks.js'
import { clampIndex, loupeAt, minutesDone, minutesLeft, stateOf, type Stage } from './theatre.js'
import { cx, formatHours } from './util.js'

export type RunTheatreProps = {
  title: string
  stages: Stage[]
  /** Start playing on mount. Off by default, so a page does not move until someone asks it to. */
  autoplay?: boolean
  /** Time on each step while playing. */
  intervalMs?: number
  /** Shown once the last step is reached, in place of the closing stage. */
  finish?: React.ReactNode
  className?: string
}

const BENCH_H = 240
const SLAB_H = 22
const SLAB_GAP = 6
/** Room under the first layer so its skew stays inside the bench. */
const FLOOR = 56

/**
 * A run played back as a build. Each step adds a layer to the object; the current layer comes in last, the loupe points
 * at the value the step produced, and the caption reads the step out word by word. Time left is worked out from the
 * steps still to come, and nothing moves unless the person asks, or sets autoplay.
 */
export function RunTheatre({ title, stages, autoplay = false, intervalMs = 3200, finish, className }: RunTheatreProps) {
  const n = stages.length
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [ref, width] = useWidth<HTMLDivElement>(560)
  const at = clampIndex(index, n)
  const stage = stages[at]
  const last = n > 0 && at === n - 1

  useEffect(() => {
    if (!playing || n === 0) return
    if (at >= n - 1) { setPlaying(false); return }
    const t = setTimeout(() => setIndex(at + 1), intervalMs)
    return () => clearTimeout(t)
  }, [playing, at, n, intervalMs])

  if (n === 0 || !stage) {
    return (
      <section role="group" className={cx('ol', className)} aria-label={title}>
        <div className="ol-head-row"><h3 className="ol-title">{title}</h3></div>
        <p className="ol-sub">No steps to play.</p>
      </section>
    )
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') { setIndex(clampIndex(at + 1, n)); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { setIndex(clampIndex(at - 1, n)); e.preventDefault() }
    else if (e.key === ' ') { setPlaying((p) => !p); e.preventDefault() }
  }
  const loupe = stage.focus ? loupeAt({ x: stage.focus.x, y: stage.focus.y }, { w: width, h: BENCH_H }, Math.min(56, width / 7)) : null
  const words = (stage.detail ?? '').split(/\s+/).filter(Boolean)

  return (
    <section role="group" className={cx('ol', 'ol-theatre', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-chips">
          <span className="ol-pill">Step {at + 1} of {n}</span>
          <span className="ol-pill" data-tone={last ? 'good' : undefined}>{last ? 'Done' : `${formatHours(minutesLeft(stages, at) / 60)} left`}</span>
        </span>
      </div>

      <div className="ol-bench" ref={ref} style={{ height: BENCH_H }} aria-hidden="true">
        {stages.map((s, i) => {
          const state = stateOf(at, i)
          if (state === 'todo') return null
          return (
            <span key={s.id} className="ol-slab" data-state={state} style={{ bottom: FLOOR + i * (SLAB_H + SLAB_GAP), height: SLAB_H }} />
          )
        })}
        {loupe && (
          <svg className="ol-leader" width={width} height={BENCH_H} aria-hidden="true">
            <line x1={loupe.tipX} y1={loupe.tipY} x2={loupe.cx} y2={loupe.cy} />
            <circle cx={loupe.tipX} cy={loupe.tipY} r={4} />
          </svg>
        )}
        {loupe && stage.focus && (
          <div key={stage.id} className="ol-loupe" style={{ left: loupe.cx - loupe.r, top: loupe.cy - loupe.r, width: loupe.r * 2, height: loupe.r * 2 }}>
            <span className="ol-sub">Checked</span>
            <b>{stage.focus.label}</b>
          </div>
        )}
      </div>

      <div key={`cap-${stage.id}`} className="ol-caption" aria-live="polite">
        {words.map((w, i) => (
          <Fragment key={`${i}-${w}`}>
            <span className="ol-capword" style={{ animationDelay: `${i * 70}ms` }}>{w}</span>
            {i < words.length - 1 && ' '}
          </Fragment>
        ))}
      </div>

      {last && finish ? finish : (
        <div className="ol-stagepanel" key={`panel-${stage.id}`}>
          <h3 className="ol-title">{stage.title}</h3>
          {stage.inputs && stage.inputs.length > 0 && (
            <>
              <div className="ol-qhead ol-mt-3">You need</div>
              <ul className="ol-chips ol-needs">{stage.inputs.map((x) => <li key={x} className="ol-pill">{x}</li>)}</ul>
            </>
          )}
          {stage.result && <p className="ol-mt-3"><span className="ol-sub">Produces </span>{stage.result}</p>}
        </div>
      )}

      <div className="ol-theatre-controls" role="toolbar" aria-label="Playback" tabIndex={0} onKeyDown={onKey}>
        <button type="button" className="ol-btn" onClick={() => setIndex(clampIndex(at - 1, n))} disabled={at === 0} aria-label="Previous step">Back</button>
        <button type="button" className="ol-btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} disabled={last}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" className="ol-btn" onClick={() => setIndex(clampIndex(at + 1, n))} disabled={last} aria-label="Next step">Next</button>
        <span className="ol-sub">{formatHours(minutesDone(stages, at) / 60)} done</span>
      </div>

      <ol className="ol-pips" aria-label="Steps">
        {stages.map((s, i) => (
          <li key={s.id}>
            <button type="button" className="ol-pip" data-state={stateOf(at, i)} aria-current={i === at ? 'step' : undefined} aria-label={`${s.title}, ${stateOf(at, i) === 'done' ? 'done' : stateOf(at, i) === 'current' ? 'now' : 'to come'}`} onClick={() => setIndex(i)}>
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
