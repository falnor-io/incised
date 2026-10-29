'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { Annotated, type Annotation } from './Annotated.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { cx } from './util.js'

export type TourStep = {
  /** What to say at this point. Read out word by word. */
  say: string
  /** What to point at: the words shown on screen ("text:Weekly re-test") or a row's id ("event-3"). Leave it out for a line with nothing to point at. */
  target?: string
  /** A short note drawn beside the target. */
  text?: string
  kind?: Annotation['kind']
}

/**
 * A walk through any component. Each step points at one part of it and says a line, the way someone would explain a page they
 * had open: a circle drawn round the thing, a note beside it, the line read out word by word. It works on every component with
 * no changes to it, because a step finds its target by the words on screen. Nothing moves until it is asked to, and the
 * component underneath is untouched: the figures stay the interface's, only the pointing and the words are the model's.
 */
export function Tour({ steps, param, className, children }: { steps: TourStep[]; param?: string; className?: string; children: ReactNode }) {
  const pb = usePlayback(steps.length, { start: 0, intervalMs: 3400, param })
  const annotations = useMemo(
    () => steps.map((s, i): Annotation => ({ kind: s.kind ?? 'circle', target: s.target, text: s.text, step: i })).filter((a) => a.target),
    [steps],
  )
  const words = (steps[pb.at]?.say ?? '').split(/\s+/).filter(Boolean)
  return (
    <div className={cx('ol-tour', className)}>
      <Annotated annotations={annotations} step={pb.at} only>{children}</Annotated>
      {words.length > 0 && (
        <p key={`say-${pb.at}`} className="ol ol-annotated-bar ol-caption ol-script ol-tour-say" aria-live="polite">
          {words.map((w, i) => (
            <Fragment key={`${i}-${w}`}>
              <span className="ol-capword" style={{ animationDelay: `${i * 60}ms` }}>{w}</span>{i < words.length - 1 && ' '}
            </Fragment>
          ))}
        </p>
      )}
      {steps.length > 1 && <div className="ol ol-annotated-bar"><PlaybackBar pb={pb} count={steps.length} label="Walk through" /></div>}
      <ol className="ol-sr">{steps.map((s, i) => <li key={i}>{s.say}</li>)}</ol>
    </div>
  )
}
