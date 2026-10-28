'use client'

import { useId, useMemo, useState } from 'react'
import { children, compareBranches, forkPoints, leaves, pathTo, type Checkpoint, type StateChange } from './branches.js'
import { cx, formatWhen } from './util.js'

export type RunBranchesProps = {
  title: string
  /** Saved states of one run, each pointing at the one it came from. A run replayed from a step with something changed forks there. */
  checkpoints: Checkpoint[]
  /** Which two ends to compare first. Defaults to the first two. */
  defaultA?: string
  defaultB?: string
  className?: string
}

const show = (v: unknown) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v))
const VERB: Record<StateChange['kind'], string> = { added: 'Added', removed: 'Removed', changed: 'Changed' }

/** Depth-first, so each branch reads top to bottom under the checkpoint it split from. */
function order(cps: Checkpoint[]): { cp: Checkpoint; depth: number }[] {
  const out: { cp: Checkpoint; depth: number }[] = []
  const ids = new Set(cps.map((c) => c.id))
  const seen = new Set<string>()
  const walk = (c: Checkpoint, depth: number) => {
    if (seen.has(c.id)) return
    seen.add(c.id)
    out.push({ cp: c, depth })
    for (const k of children(cps, c.id)) walk(k, depth + 1)
  }
  for (const c of cps) if (!c.parentId || !ids.has(c.parentId)) walk(c, 0)
  for (const c of cps) walk(c, 0)
  return out
}

/**
 * One run seen as a tree of saved states. Where it was replayed from an earlier step with something changed, the tree
 * forks, and any two ends can be set side by side: where they split, what only each did, and exactly which saved
 * values differ at the end. Everything is read from the saved states, so nothing about the difference is guessed.
 */
export function RunBranches({ title, checkpoints, defaultA, defaultB, className }: RunBranchesProps) {
  const ends = useMemo(() => leaves(checkpoints), [checkpoints])
  const forks = useMemo(() => new Set(forkPoints(checkpoints).map((c) => c.id)), [checkpoints])
  const rows = useMemo(() => order(checkpoints), [checkpoints])
  const [a, setA] = useState(defaultA ?? ends[0]?.id ?? '')
  const [b, setB] = useState(defaultB ?? ends[1]?.id ?? ends[0]?.id ?? '')
  const base = useId()
  const cmp = useMemo(() => compareBranches(checkpoints, a, b), [checkpoints, a, b])
  const name = (id: string) => ends.find((e) => e.id === id)?.label ?? id
  if (checkpoints.length === 0) {
    return (
      <section role="group" className={cx('ol', className)} aria-label={title}>
        <div className="ol-head-row"><h3 className="ol-title">{title}</h3></div>
        <p className="ol-sub">No saved states for this run.</p>
      </section>
    )
  }
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <span className="ol-sub">{checkpoints.length} saved {checkpoints.length === 1 ? 'state' : 'states'}, {forks.size} {forks.size === 1 ? 'fork' : 'forks'}</span>
      </div>
      <ul className="ol-cptree" aria-label="Saved states">
        {rows.map(({ cp, depth }) => (
          <li key={cp.id} className="ol-cprow" style={{ paddingInlineStart: 8 + depth * 14 }} data-fork={forks.has(cp.id)} data-end={ends.some((e) => e.id === cp.id)} data-picked={cp.id === a ? 'a' : cp.id === b ? 'b' : undefined}>
            <span>{cp.label}</span>
            <span className="ol-sub">{formatWhen(cp.at)}{forks.has(cp.id) ? ' · the run forks here' : ''}{cp.id === a ? ' · A' : cp.id === b ? ' · B' : ''}</span>
          </li>
        ))}
      </ul>
      {ends.length > 1 && (
        <>
          <div className="ol-cppick">
            <label htmlFor={`${base}-a`}>Compare</label>
            <select id={`${base}-a`} className="ol-textarea" value={a} onChange={(e) => setA(e.target.value)}>{ends.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
            <label htmlFor={`${base}-b`}>with</label>
            <select id={`${base}-b`} className="ol-textarea" value={b} onChange={(e) => setB(e.target.value)}>{ends.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
          </div>
          <p role="status"  className="ol-my-3">{cmp.text}</p>
          {(cmp.onlyA.length > 0 || cmp.onlyB.length > 0) && (
            <div className="ol-cpsides">
              <div><p className="ol-sub">Only {name(a)}</p><ol>{cmp.onlyA.map((c) => <li key={c.id}>{c.label}</li>)}</ol></div>
              <div><p className="ol-sub">Only {name(b)}</p><ol>{cmp.onlyB.map((c) => <li key={c.id}>{c.label}</li>)}</ol></div>
            </div>
          )}
          {cmp.changes.length > 0 && (
            <table className="ol-table" aria-label="State differences">
              <thead><tr><th>Value</th><th>{name(a)}</th><th>{name(b)}</th></tr></thead>
              <tbody>
                {cmp.changes.map((c) => (
                  <tr key={c.path}><th scope="row">{c.path}</th><td>{c.kind === 'added' ? <span className="ol-sub">not set</span> : show(c.before)}</td><td>{c.kind === 'removed' ? <span className="ol-sub">removed</span> : show(c.after)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {ends.length === 1 && <p className="ol-sub ol-mt-3">The run never forked, so there is one path: {pathTo(checkpoints, ends[0]!.id).length} states.</p>}
    </section>
  )
}
