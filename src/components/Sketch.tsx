'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { SketchProps } from '../schemas.js'
import { useWidth } from './hooks.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { beats, checkSketch, layoutBoxes, layoutLinks, roughBox } from './sketchlayout.js'
import { gateFor, pendingRow, type Status } from './status.js'
import { cx } from './util.js'

export type SketchComponentProps = SketchProps & { status?: Status; param?: string; className?: string }

const maxChars = (w: number) => Math.max(4, Math.floor(w / 7.4))
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * A model's explanation drawn as a notebook page. It gives boxes on a grid, the arrows between them and what to say as each
 * part appears; the boxes are placed and the strokes drawn here, so a model never writes a coordinate. Each beat draws what
 * it names and reads its line out word by word, and nothing moves until it is asked to. The hand-drawn look is the cue that
 * this is the model's own explanation, not a figure the interface computed.
 */
export function Sketch({ title, heading, subtitle, nodes: rawNodes, arrows: rawArrows, steps, status, param, className }: SketchComponentProps) {
  const [ref, width] = useWidth<HTMLDivElement>(560)
  const checked = useMemo(() => checkSketch(rawNodes, rawArrows), [rawNodes, rawArrows])
  const { boxes, height } = useMemo(() => layoutBoxes(checked.nodes, width), [checked.nodes, width])
  const links = useMemo(() => layoutLinks(checked.arrows, boxes), [checked.arrows, boxes])
  const plan = useMemo(() => beats(checked.nodes, steps), [checked.nodes, steps])
  const pb = usePlayback(plan.length, { start: Math.max(0, plan.length - 1), intervalMs: 2800, param })
  // Strokes draw in only after a person has moved the playhead, so the page a reader lands on is already whole.
  const [moved, setMoved] = useState(false)
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } setMoved(true) }, [pb.at])

  const gate = gateFor(status, { title, className, rows: 4 })
  if (gate) return gate

  const beat = plan[pb.at] ?? plan[0]
  const visible = beat?.visible ?? new Set<string>()
  const fresh = new Set(moved ? beat?.newest ?? [] : [])
  const words = (beat?.say ?? '').split(/\s+/).filter(Boolean)
  const pointer = beat?.newest.length ? boxes.get(beat.newest[beat.newest.length - 1]!) : undefined
  const summary = `${title}. ${checked.nodes.map((n) => n.label).join(', ')}.`

  return (
    <section role="group" className={cx('ol', 'ol-sketch', className)} aria-label={title} aria-busy={status === 'partial' || undefined}>
      <div className="ol-sk-bar">{title}</div>
      <div className="ol-sk-page">
        {heading && <h3 className="ol-script ol-sk-heading">{heading}</h3>}
        {subtitle && <p className="ol-script ol-sk-sub">{subtitle}</p>}
        <div ref={ref} className="ol-sk-stage">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
            {links.filter((l) => visible.has(l.from) && visible.has(l.to)).map((l) => {
              const isNew = fresh.has(l.from) || fresh.has(l.to)
              return (
                <g key={l.id} className="ol-sk-link">
                  <path d={l.path} pathLength={1} className={isNew ? 'ol-draw' : undefined} />
                  <path d={l.head} pathLength={1} className={isNew ? 'ol-draw' : undefined} />
                  {l.label && <text x={l.lx} y={l.ly} textAnchor="middle" className="ol-script ol-sk-lab">{clip(l.label, 20)}</text>}
                </g>
              )
            })}
            {checked.nodes.filter((n) => visible.has(n.id)).map((n) => {
              const b = boxes.get(n.id)!
              const isNew = fresh.has(n.id)
              return (
                <g key={n.id} className="ol-sk-node" data-kind={n.kind ?? 'plain'}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="ol-sk-fill" />
                  {roughBox(b, n.id).map((d, i) => <path key={i} d={d} pathLength={1} className={cx('ol-sk-edge', isNew && 'ol-draw')} data-pass={i} />)}
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" className="ol-script ol-sk-text">{clip(n.label, maxChars(b.w))}</text>
                </g>
              )
            })}
            {pointer && <polygon className="ol-sk-pointer" points="0,0 13,5 5,13" style={{ transform: `translate(${pointer.x + pointer.w - 6}px, ${pointer.y - 8}px)` }} />}
          </svg>
        </div>
        {words.length > 0 && (
          <p key={`say-${pb.at}`} className="ol-caption ol-sk-say" aria-live="polite">
            {words.map((w, i) => (
              <Fragment key={`${i}-${w}`}>
                <span className="ol-capword" style={{ animationDelay: `${i * 60}ms` }}>{w}</span>{i < words.length - 1 && ' '}
              </Fragment>
            ))}
          </p>
        )}
        {pendingRow(status)}
        {plan.length > 1 && <PlaybackBar pb={pb} count={plan.length} label={title} />}
      </div>
      <ol className="ol-sr">{plan.map((b, i) => <li key={i}>{b.say || checked.nodes.filter((n) => b.newest.includes(n.id)).map((n) => n.label).join(', ')}</li>)}</ol>
    </section>
  )
}
