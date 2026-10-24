import { useMemo, useState } from 'react'
import type { EvidenceDiffProps } from '../schemas.js'
import { diffSeq, splitWords, type DiffOp } from './diff.js'
import { cx } from './util.js'

const MAX_LINES = 400

type Row = { left?: DiffOp; right?: DiffOp }

/** Pairs each run of removals with the additions that follow it, so a changed line sits on one row. */
function toRows(ops: DiffOp[]): Row[] {
  const rows: Row[] = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]!
    if (op.type === 'same') {
      rows.push({ left: op, right: op })
      i++
      continue
    }
    const dels: DiffOp[] = []
    const adds: DiffOp[] = []
    while (ops[i]?.type === 'del') dels.push(ops[i++]!)
    while (ops[i]?.type === 'add') adds.push(ops[i++]!)
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] })
  }
  return rows
}

function Words({ text, other, side }: { text: string; other: string; side: 'del' | 'add' }) {
  const ops = diffSeq(splitWords(side === 'del' ? text : other), splitWords(side === 'del' ? other : text))
  const show = side === 'del' ? ops.filter((o) => o.type !== 'add') : ops.filter((o) => o.type !== 'del')
  // A space between two changed words is part of the same change, so it is marked too and the highlight stays whole.
  const changed = show.map((o, i) => o.type !== 'same' || (/^\s+$/.test(o.text) && show[i - 1]?.type !== 'same' && show[i - 1] !== undefined && show[i + 1]?.type !== 'same' && show[i + 1] !== undefined))
  const out: { text: string; changed: boolean }[] = []
  show.forEach((o, i) => {
    const last = out[out.length - 1]
    if (last && last.changed === changed[i]) last.text += o.text
    else out.push({ text: o.text, changed: changed[i]! })
  })
  return <>{out.map((o, i) => (o.changed ? <mark key={i} className="ic-word" data-kind={side}>{o.text}</mark> : <span key={i}>{o.text}</span>))}</>
}

/** A before and after of text, such as a prompt, a policy or an output, with changed words marked. */
export function EvidenceDiff({ title, before, after, beforeLabel = 'Before', afterLabel = 'After', className }: EvidenceDiffProps & { className?: string }) {
  const [mode, setMode] = useState<'split' | 'unified'>('split')
  const a = before.split('\n')
  const b = after.split('\n')
  const tooBig = a.length > MAX_LINES || b.length > MAX_LINES
  const ops = useMemo(() => (tooBig ? [] : diffSeq(a, b)), [before, after, tooBig])
  const rows = useMemo(() => toRows(ops), [ops])
  const added = ops.filter((o) => o.type === 'add').length
  const removed = ops.filter((o) => o.type === 'del').length

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
        <div className="ic-chips" role="group" aria-label="View">
          <button type="button" className="ic-chip" aria-pressed={mode === 'split'} onClick={() => setMode('split')}>Side by side</button>
          <button type="button" className="ic-chip" aria-pressed={mode === 'unified'} onClick={() => setMode('unified')}>One column</button>
        </div>
      </div>
      {tooBig ? (
        <p className="ic-sub">Too long to compare here (over {MAX_LINES} lines). Diff it before passing it in.</p>
      ) : added + removed === 0 ? (
        <p className="ic-sub">No differences.</p>
      ) : (
        <>
          <p className="ic-sub" style={{ margin: '0 0 8px' }}>{added} lines added, {removed} removed</p>
          {mode === 'split' ? (
            <div className="ic-diff" role="table">
              <div className="ic-diff-head" role="row"><span role="columnheader">{beforeLabel}</span><span role="columnheader">{afterLabel}</span></div>
              {rows.map((r, i) => (
                <div className="ic-diff-row" role="row" key={i}>
                  <pre role="cell" data-kind={r.left?.type === 'del' ? 'del' : 'same'}>
                    {r.left && r.left.type === 'del' && r.right?.type === 'add' ? <Words text={r.left.text} other={r.right.text} side="del" /> : r.left?.text}
                  </pre>
                  <pre role="cell" data-kind={r.right?.type === 'add' ? 'add' : 'same'}>
                    {r.right && r.right.type === 'add' && r.left?.type === 'del' ? <Words text={r.right.text} other={r.left.text} side="add" /> : r.right?.text}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="ic-diff-uni">
              {ops.map((o, i) => (
                <pre key={i} data-kind={o.type}>
                  <span aria-hidden="true">{o.type === 'add' ? '+ ' : o.type === 'del' ? '- ' : '  '}</span>
                  <span className="ic-sr">{o.type === 'add' ? 'added: ' : o.type === 'del' ? 'removed: ' : ''}</span>{o.text}
                </pre>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
