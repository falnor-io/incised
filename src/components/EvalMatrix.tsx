import { useState } from 'react'
import type { EvalMatrixProps } from '../schemas.js'
import { clopperPearson, mcnemarExact } from '../verify/stats.js'
import { Check, Cross } from './icons.js'
import { cx, pct } from './util.js'

/** Cases by runs, with the pass rate and exact interval per run and a paired comparison of any two runs. */
export function EvalMatrix({ title, cases, runs, className }: EvalMatrixProps & { className?: string }) {
  const [baseIdx, setBase] = useState(0)
  const [candIdx, setCand] = useState(Math.min(1, runs.length - 1))
  const base = runs[baseIdx] ?? runs[0]!
  const cand = runs[candIdx] ?? runs[runs.length - 1]!

  const stats = runs.map((run) => {
    const passes = cases.filter((c) => run.results[c.id] === true).length
    return { label: run.label, passes, ...clopperPearson(passes, cases.length) }
  })

  let regressed = 0
  let improved = 0
  const flips = new Map<string, 'regressed' | 'improved'>()
  for (const c of cases) {
    const a = base.results[c.id] === true
    const b = cand.results[c.id] === true
    if (a && !b) (regressed++, flips.set(c.id, 'regressed'))
    if (!a && b) (improved++, flips.set(c.id, 'improved'))
  }
  const p = mcnemarExact(regressed, improved)
  const same = baseIdx === candIdx
  const verdict = same
    ? { tone: undefined, text: 'Pick two different runs to compare.' }
    : regressed > improved && p < 0.05
      ? { tone: 'bad' as const, text: `Regression: ${regressed} worse, ${improved} better` }
      : regressed > improved
        ? { tone: 'warn' as const, text: `Possible drift: ${regressed} worse, ${improved} better` }
        : { tone: 'good' as const, text: `No regression: ${regressed} worse, ${improved} better` }

  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      <div className="kl-scroll">
        <table className="kl-table">
          <thead>
            <tr>
              <th scope="col">Case</th>
              {runs.map((r) => <th scope="col" key={r.label}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} data-flip={flips.get(c.id)}>
                <th scope="row">{c.label}</th>
                {runs.map((r) => (
                  <td key={r.label} data-pass={r.results[c.id] === true ? 'true' : 'false'}>
                    <span className="kl-cellmark" role="img" aria-label={r.results[c.id] === true ? 'pass' : 'fail'}>{r.results[c.id] === true ? <Check /> : <Cross />}</span>
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
                  <div className="kl-sub">{pct(s.lower, 0)} to {pct(s.upper, 0)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="kl-compare-bar">
        <label>Before <select value={baseIdx} onChange={(e) => setBase(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <label>After <select value={candIdx} onChange={(e) => setCand(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <span className="kl-pill" data-tone={verdict.tone} role="status" title="Paired comparison on the same cases, exact McNemar test. Intervals are 95% exact.">{verdict.text}</span>{!same && <span className="kl-sub">p {p < 0.001 ? '< 0.001' : p.toFixed(3)}</span>}
      </div>
    </section>
  )
}
