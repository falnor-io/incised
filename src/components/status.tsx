import type { ReactNode } from 'react'
import { cx } from './util.js'

/**
 * Where a piece of generated UI is in its life, so a component can be placed before its data is whole.
 * `loading`: nothing yet, show a skeleton of the same height. `partial`: some data has arrived, show it and mark the
 * rest as still coming. `awaiting`: all of it is here and a person has to act before anything goes on. `ready`: all of it.
 * `error`: it will not arrive. Follows the stages a streamed tool call goes through.
 */
export type Status = 'loading' | 'partial' | 'awaiting' | 'ready' | 'error'

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

/** A trailing row that says more is on the way, or that a person has to act. Rendered only while a component is partial or awaiting. */
export function pendingRow(status: Status | undefined): ReactNode {
  if (status === 'partial') return <p className="ol-sub ol-pending" role="status">More is on the way</p>
  if (status === 'awaiting') return <p className="ol-sub ol-pending" role="status">Waiting for a person to decide</p>
  return null
}

export type FieldStatus = 'streaming' | 'complete'

/**
 * Which fields of a streaming object are still being written, in the way assistant-ui's `propStatus` and Hashbrown's parser
 * nodes report it. Without a parser this is an approximation: a model writes keys in order, so while the object is open the
 * last key present is the one still arriving and the keys before it are done. Once the object is complete, every key is.
 */
export function propStatus(args: Record<string, unknown> | undefined, argsComplete: boolean): { argsStatus: FieldStatus; propStatus: Record<string, FieldStatus> } {
  const keys = Object.keys(args ?? {})
  const last = keys[keys.length - 1]
  return {
    argsStatus: argsComplete ? 'complete' : 'streaming',
    propStatus: Object.fromEntries(keys.map((k) => [k, !argsComplete && k === last ? 'streaming' : 'complete'])) as Record<string, FieldStatus>,
  }
}

/**
 * Reads the JSON a model has written so far. Streamed text stops anywhere, so an open string, array or object is closed
 * at the end and the value is whatever is known now. `complete` is true only when the text parses as it stands. A key that
 * has been written but has no value yet is dropped, because a value that has not started is not a value.
 */
export function parsePartial(text: string): { value: unknown; complete: boolean } {
  try { return { value: JSON.parse(text), complete: true } } catch { /* fall through to repair */ }
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue }
    if (ch === '"') inString = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = inString ? (escaped ? text.slice(0, -1) : text) + '"' : text
  // Take off a dangling comma, colon, or key that has no value yet, then close what is open.
  for (let i = 0; i < 4; i++) {
    const t = out.replace(/\s+$/, '')
    if (/,$/.test(t)) out = t.slice(0, -1)
    else if (/:$/.test(t)) out = t.slice(0, -1).replace(/"(?:[^"\\]|\\.)*"\s*$/, '').replace(/,\s*$/, '')
    else if (/[{,]\s*"(?:[^"\\]|\\.)*"$/.test(t) && stack[stack.length - 1] === '}') out = t.replace(/"(?:[^"\\]|\\.)*"$/, '').replace(/,\s*$/, '')
    else break
  }
  try { return { value: JSON.parse(out + stack.reverse().join('')), complete: false } } catch { return { value: undefined, complete: false } }
}
