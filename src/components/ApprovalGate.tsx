import type { ApprovalGateProps } from '../schemas.js'
import { cx, formatWhen } from './util.js'

const COPY = {
  pending: { word: 'Waiting', tone: undefined },
  approved: { word: 'Approved', tone: 'good' },
  escalated: { word: 'Escalated, as designed', tone: 'good' },
  rejected: { word: 'Rejected', tone: 'bad' },
} as const

/** A human approval step. Escalation counts as a correct outcome, not a failure. */
export function ApprovalGate({ action, approver, state, note, at, className }: ApprovalGateProps & { className?: string }) {
  const c = COPY[state]
  return (
    <section className={cx('kl', className)} aria-label={`Approval: ${action}`}>
      <div className="kl-head-row">
        <strong>{action}</strong>
        <span className="kl-pill" data-tone={c.tone}>{c.word}</span>
      </div>
      <p className="kl-sub" style={{ margin: 0 }}>{approver}{at && ` · ${formatWhen(at)}`}</p>
      {note && <p style={{ margin: '8px 0 0' }}>{note}</p>}
    </section>
  )
}
