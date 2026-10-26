'use client'

import { useState } from 'react'
import type { EvalMatrixProps } from '../schemas.js'
import { clopperPearson } from '../verify/stats.js'
import { compareRuns } from './evalcompare.js'
import { Check, Cross } from './icons.js'
import { cx, pct } from './util.js'

/** Cases by runs, with the pass rate and exact interval per run and a paired comparison of any two runs. */
export function EvalMatrix({ title, cases, runs, className }: EvalMatrixProps & { className?: string }) {
  const [baseIdx, setBase] = useState(0)
  const [candIdx, setCand] = useState(Math.min(1, runs.length - 1))
  const [filter, setFilter] = useState<'all' | 'flipped' | 'regressed' | 'improved'>('all')
  const base = runs[baseIdx] ?? runs[0]!
  const cand = runs[candIdx] ?? runs[runs.length - 1]!

  const stats = runs.map((run) => {
    const passes = cases.filter((c) => run.results[c.id] === true).length
    return { label: run.label, passes, ...clopperPearson(passes, cases.length) }
  })

  const same = baseIdx === candIdx
  const cmp = compareRuns(cases, base, cand, same)
  const { regressed, improved, flips, p } = cmp
  const tone = { regression: 'bad', 'possible-drift': 'warn', improvement: 'good', 'possible-gain': 'good', mixed: undefined, 'no-change': 'good', 'same-run': undefined }[cmp.verdict] as 'bad' | 'warn' | 'good' | undefined
  const verdict = { tone, text: cmp.text }
  const shown = cases.filter((c) => filter === 'all' || (filter === 'flipped' ? flips.has(c.id) : flips.get(c.id) === filter))
  // How each run stands against the "before" run: the count of cases it lost and won.
  const against = runs.map((r) => (r === base ? null : compareRuns(cases, base, r)))

  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      <div className="ol-scroll">
        <table className="ol-table">
          <thead>
            <tr>
              <th scope="col">Case</th>
              {runs.map((r, i) => <th scope="col" key={r.label}>{r.label}{against[i] && (against[i]!.regressed > 0 || against[i]!.improved > 0) && <div className="ol-sub" title={`Against ${base.label}: ${against[i]!.regressed} cases lost, ${against[i]!.improved} won`}>{against[i]!.regressed > 0 ? `▼${against[i]!.regressed}` : ''} {against[i]!.improved > 0 ? `▲${against[i]!.improved}` : ''}</div>}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} data-flip={flips.get(c.id)}>
                <th scope="row">{c.label}</th>
                {runs.map((r) => (
                  <td key={r.label} data-pass={r.results[c.id] === true ? 'true' : 'false'}>
                    <span className="ol-cellmark" role="img" aria-label={r.results[c.id] === true ? 'pass' : 'fail'}>{r.results[c.id] === true ? <Check /> : <Cross />}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Pass rate</th>
              {stats.map((s) => (
                <td key={s.label}>
                  <strong>{pct(s.passes / cases.length, 0)}</strong>
                  <div className="ol-sub">{pct(s.lower, 0)} to {pct(s.upper, 0)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="ol-chips" role="group" aria-label="Show cases" style={{ margin: '8px 0' }}>
        {([['all', 'All', cases.length], ['flipped', 'Changed', regressed + improved], ['regressed', 'Worse', regressed], ['improved', 'Better', improved]] as const).map(([id, label, n]) => (
          <button key={id} type="button" className="ol-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} {n}</button>
        ))}
      </div>
      <div className="ol-compare-bar">
        <label>Before <select value={baseIdx} onChange={(e) => setBase(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <label>After <select value={candIdx} onChange={(e) => setCand(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <span className="ol-pill" data-tone={verdict.tone} role="status" title="Paired comparison on the same cases, exact McNemar test. Intervals are 95% exact.">{verdict.text}</span>{!same && <span className="ol-sub">p {p < 0.001 ? '< 0.001' : p.toFixed(3)}</span>}
      </div>
    </section>
  )
}
