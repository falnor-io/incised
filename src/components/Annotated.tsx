'use client'

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PlaybackBar, usePlayback } from './playback.js'
import { cx } from './util.js'

export type Annotation = {
  kind: 'sticky' | 'pin' | 'circle' | 'tag'
  /** The id of an element inside, from its `data-annotate` attribute. Components give their rows and steps one, such as `event-3`. */
  target?: string
  /** Or a point on the whole area, as shares of its width and height (0 to 1). */
  at?: { x: number; y: number }
  text?: string
  tone?: 'yellow' | 'pink' | 'green' | 'blue'
  /** The beat it comes in on. Notes with no step are always shown. */
  step?: number
}

type Place = { x: number; y: number; w: number; h: number }

const esc = (s: string) => s.replace(/["\\]/g, '\\$&')

/**
 * Finds words on the page and returns where they are. A model can point at what it was shown ("text:Weekly re-test") without
 * knowing any id, so every component can be marked up. Hidden text and the notes themselves are skipped.
 */
function findText(host: HTMLElement, needle: string): { left: number; top: number; width: number; height: number } | null {
  const want = needle.trim().toLowerCase()
  if (!want) return null
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    const at = text.toLowerCase().indexOf(want)
    if (at < 0) continue
    const parent = n.parentElement
    if (!parent || parent.closest('.ol-sr, .ol-ann-layer, .ol-annotated-bar, [aria-hidden="true"]')) continue
    const range = document.createRange()
    range.setStart(n, at)
    range.setEnd(n, at + want.length)
    const r = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : parent.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  return null
}
const TILT = [-2, 1.5, -1, 2]

/**
 * Notes drawn over a component the way someone would mark up a page they were explaining: a sticky note, a pin with a label,
 * a circle drawn round a row, a tag on a leader line. Each is anchored to an element by id, so it follows the layout when the
 * page resizes and a model never writes a pixel. A note whose target is not there is left out.
 */
export function Annotated({ annotations, playable = false, param, step, only = false, className, children }: { annotations: Annotation[]; playable?: boolean; param?: string; /** Drive the beat from outside, as `Tour` does. Then no bar is drawn here. */ step?: number; /** Show only the notes of the current beat, not the ones before it. */ only?: boolean; className?: string; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<{ area: { w: number; h: number }; at: (Place | null)[] } | null>(null)
  const beats = Math.max(1, ...annotations.map((a) => (a.step ?? 0) + 1))
  const own = usePlayback(beats, { start: beats - 1, intervalMs: 2400, param })
  const pb = step === undefined ? own : { ...own, at: step }

  const key = useMemo(() => JSON.stringify(annotations), [annotations])
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const at = annotations.map((a): Place | null => {
        if (a.target) {
          const r = a.target.startsWith('text:') ? findText(el, a.target.slice(5)) : el.querySelector(`[data-annotate="${esc(a.target)}"]`)?.getBoundingClientRect()
          return r ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : null
        }
        return a.at ? { x: Math.min(1, Math.max(0, a.at.x)) * box.width, y: Math.min(1, Math.max(0, a.at.y)) * box.height, w: 0, h: 0 } : null
      })
      setPlaces({ area: { w: box.width, h: box.height }, at })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const shown = annotations.map((a, i) => ({ a, i, p: places?.at[i] ?? null })).filter(({ a, p }) => p && (only ? (a.step ?? 0) === pb.at : (a.step ?? 0) <= pb.at))
  const clampX = (x: number, w: number) => (places ? Math.max(4, Math.min(places.area.w - w - 4, x)) : x)

  return (
    <div className={cx('ol-annotated', className)}>
      <div ref={host} className="ol-ann-host">
        {children}
        {places && (
          <div className="ol-ann-layer" aria-hidden="true">
            <svg width={places.area.w} height={places.area.h} aria-hidden="true">
              {shown.map(({ a, i, p }) => {
                if (!p) return null
                if (a.kind === 'circle') return <ellipse key={`${i}-${pb.at}`} cx={p.x + Math.min(p.w, 440) / 2} cy={p.y + p.h / 2} rx={Math.min(p.w, 440) / 2 + 8} ry={p.h / 2 + 6} pathLength={1} className="ol-ann-circle ol-draw" />
                if (a.kind === 'tag') return <line key={i} x1={p.x + p.w / 2} y1={Math.max(0, p.y - 4)} x2={p.x + p.w / 2} y2={p.y + p.h / 2} className="ol-ann-leader" />
                if (a.kind === 'pin') return <circle key={i} cx={p.x + p.w / 2} cy={p.y + p.h / 2} r={3.5} className="ol-ann-dot" />
                return null
              })}
            </svg>
            {shown.map(({ a, i, p }) => {
              if (!p || !a.text) return null
              const tone = a.tone ?? (a.kind === 'sticky' ? 'yellow' : a.kind === 'tag' ? 'pink' : 'blue')
              if (a.kind === 'sticky') return <div key={`${i}-${pb.at}`} className="ol-ann-sticky ol-script" data-tone={tone} style={{ left: clampX(p.x + p.w * 0.55, 150), top: Math.max(2, p.y - 10), ['--tilt' as string]: `${TILT[i % TILT.length]}deg` }}>{a.text}</div>
              if (a.kind === 'tag') return <span key={i} className="ol-ann-chip ol-script" data-tone={tone} style={{ left: clampX(p.x + p.w / 2 - 36, 90), top: Math.max(2, p.y - 30) }}>{a.text}</span>
              if (a.kind === 'pin') return <span key={i} className="ol-ann-chip ol-script" data-tone={tone} style={{ left: clampX(p.x + p.w / 2 + 6, 90), top: Math.max(2, p.y + p.h / 2 - 28) }}>{a.text}</span>
              // A note on a circle sits beside it, on the same line, so it never covers the row above.
              return <span key={`${i}-${pb.at}`} className="ol-ann-chip ol-script" data-tone={tone} style={{ left: clampX(p.x + Math.min(p.w, 440) + 18, 110), top: Math.max(2, p.y + p.h / 2 - 13) }}>{a.text}</span>
            })}
          </div>
        )}
      </div>
      <ul className="ol-sr">{annotations.filter((a) => a.text).map((a, i) => <li key={i}>{a.text}</li>)}</ul>
      {playable && step === undefined && beats > 1 && <div className="ol ol-annotated-bar"><PlaybackBar pb={pb} count={beats} label="Notes" /></div>}
    </div>
  )
}
