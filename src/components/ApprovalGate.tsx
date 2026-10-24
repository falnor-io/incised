import type { ApprovalGateProps } from '../schemas.js'
import { cx, formatWhen } from './util.js'

const COPY = {
  pending: { word: 'Waiting for approval', tone: undefined, line: 'The agent has stopped and will not continue without a decision.' },
  approved: { word: 'Approved', tone: 'good', line: 'A person approved this action.' },
  escalated: { word: 'Escalated to a person', tone: 'good', line: 'The gate worked: the agent handed this to a person instead of acting.' },
  rejected: { word: 'Rejected', tone: 'bad', line: 'A person declined this action. It was not taken.' },
} as const

/** A human approval step. Escalation counts as a correct outcome, not a failure. */
export function ApprovalGate({ action, approver, state, note, at, className }: ApprovalGateProps & { className?: string }) {
  const c = COPY[state]
  return (
    <section className={cx('ic', className)} aria-label={`Approval: ${action}`}>
      <div className="ic-head-row">
        <strong>{action}</strong>
        <span className="ic-pill" data-tone={c.tone}>{c.word}</span>
      </div>
      <p className="ic-sub" style={{ margin: 0 }}>
        {c.line} Approver: {approver}{at && ` · ${formatWhen(at)}`}
      </p>
      {note && <p style={{ margin: '8px 0 0' }}>{note}</p>}
    </section>
  )
}
