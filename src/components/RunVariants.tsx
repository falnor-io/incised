import { groupVariants, type VariantRun } from './variants.js'
import { cx, pct } from './util.js'

export type RunVariantsProps = {
  title: string
  runs: VariantRun[]
  /** The path the agent was meant to take. Without it, paths are only grouped and counted. */
  plan?: string[]
  className?: string
}

/**
 * Many runs grouped by the path they took, the way a process-mining variant view does. Each path says how many runs took
 * it, whether it followed the plan and what it skipped, and how often it failed with an exact interval, so a path that
 * failed 3 of 4 times is not mistaken for one that failed 300 of 400.
 */
export function RunVariants({ title, runs, plan, className }: RunVariantsProps) {
  const r = groupVariants(runs, plan)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        {r.conforming !== null && r.total > 0 && <span className="ol-pill" data-tone={r.conforming === r.total ? 'good' : 'warn'}>{r.conforming} of {r.total} followed the plan</span>}
      </div>
      <p className="ol-sub ol-mb-2">{r.text}</p>
      {r.variants.length > 0 && (
        <ol className="ol-variants" aria-label="Paths, most common first">
          {r.variants.map((v, i) => (
            <li key={v.key} className="ol-variant" data-conforms={v.conforms === null ? undefined : String(v.conforms)}>
              <div className="ol-variantbar" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0.02, v.share)})` }} /></div>
              <div className="ol-varianthead">
                <b>Path {i + 1}</b>
                <span className="ol-sub">{v.count} {v.count === 1 ? 'run' : 'runs'}, {pct(v.share, 0)}</span>
                {v.conforms === true && <span className="ol-pill" data-tone="good">Followed the plan</span>}
                {v.conforms === false && <span className="ol-pill" data-tone="warn">Left the plan</span>}
                {v.failed > 0 && <span className="ol-pill" data-tone="bad" title={`Exact interval ${pct(v.lower, 0)} to ${pct(v.upper, 0)}`}>Failed {v.failed} of {v.count} ({pct(v.lower, 0)} to {pct(v.upper, 0)})</span>}
              </div>
              <ol className="ol-varsteps">
                {v.steps.map((s, k) => <li key={`${k}-${s}`} data-extra={v.extra.includes(s)}>{s}</li>)}
              </ol>
              {(v.missing.length > 0 || v.outOfOrder) && (
                <p className="ol-sub ol-fielderr ol-mt-1">
                  {v.missing.length > 0 && `Skipped: ${v.missing.join(', ')}. `}
                  {v.extra.length > 0 && `Not in the plan: ${v.extra.join(', ')}. `}
                  {v.outOfOrder && 'Some steps ran out of order.'}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
