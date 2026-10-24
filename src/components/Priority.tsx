import type { PriorityProps } from '../schemas.js'
import { cx } from './util.js'

const QUADRANTS = [
  { name: 'Quick wins', impact: 'high', effort: 'low' },
  { name: 'Big bets', impact: 'high', effort: 'high' },
  { name: 'Fill-ins', impact: 'low', effort: 'low' },
  { name: 'Park for now', impact: 'low', effort: 'high' },
] as const

/** Sorts items by impact and effort. The caption is fixed text: this is a judgement, not a measurement. */
export function Priority({ title, items, className }: PriorityProps & { className?: string }) {
  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      <div className="kl-grid">
        {QUADRANTS.map((q) => {
          const here = items.filter((i) => i.impact === q.impact && i.effort === q.effort)
          return (
            <div className="kl-cell" key={q.name}>
              <h4>{q.name}</h4>
              {here.length ? <ul>{here.map((i) => <li key={i.label}>{i.label}</li>)}</ul> : <span className="kl-sub">Nothing here</span>}
            </div>
          )
        })}
      </div>
      <p className="kl-sub" style={{ marginBottom: 0 }}>A judgement, not a measurement.</p>
    </section>
  )
}
