import { useState } from 'react'
import type { EvalMatrixProps } from '../schemas.js'
import { clopperPearson, mcnemarExact } from '../verify/stats.js'
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
      ? { tone: 'bad' as const, text: `Regression: ${regressed} cases got worse and ${improved} got better (p = ${p.toFixed(3)}). Block the upgrade.` }
      : regressed > improved
        ? { tone: 'warn' as const, text: `Possible drift: ${regressed} worse, ${improved} better, not significant (p = ${p.toFixed(3)}). Review every regressed case.` }
        : { tone: 'good' as const, text: `No regression detected: ${regressed} worse, ${improved} better (p = ${p.toFixed(3)}).` }

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <h3 className="ic-title">{title}</h3>
      <div className="ic-scroll">
        <table className="ic-table">
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
                    <span className="ic-cellmark" role="img" aria-label={r.results[c.id] === true ? 'pass' : 'fail'}>{r.results[c.id] === true ? '✓' : '✗'}</span>
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
                  <div className="ic-sub">{pct(s.lower, 0)} to {pct(s.upper, 0)}</div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="ic-compare-bar">
        <label>Before <select value={baseIdx} onChange={(e) => setBase(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <label>After <select value={candIdx} onChange={(e) => setCand(Number(e.target.value))}>{runs.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}</select></label>
        <span className="ic-pill" data-tone={verdict.tone} role="status">{verdict.text}</span>
      </div>
      <p className="ic-sub" style={{ marginBottom: 0 }}>Paired comparison on the same cases (exact McNemar). Intervals are 95% exact, so a small case set stays wide.</p>
    </section>
  )
}
