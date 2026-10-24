import type { FunnelProps } from '../schemas.js'
import { cx, pct } from './util.js'

/** How many make it through each step. The share kept at each step is computed here. */
export function Funnel({ title, unit, steps, className }: FunnelProps & { className?: string }) {
  const first = steps[0]?.value ?? 0
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <h3 className="ic-title">{title}</h3>
      {steps.map((step, i) => {
        const prev = steps[i - 1]?.value
        const kept = prev && prev > 0 ? step.value / prev : null
        return (
          <div key={step.label}>
            <div className="ic-row">
              <span>{step.label}</span>
              <div className="ic-bar" role="img" aria-label={`${step.label}: ${step.value} ${unit}`}>
                <span style={{ width: `${first > 0 ? (step.value / first) * 100 : 0}%` }} />
              </div>
              <span className="ic-mono">{step.value} {unit}</span>
            </div>
            {kept !== null && <p className="ic-kept">{pct(kept, 0)} kept from the step before</p>}
          </div>
        )
      })}
    </section>
  )
}
