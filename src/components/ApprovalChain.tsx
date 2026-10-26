import { judgeChain, type ChainDecision, type ChainStatus, type ChainStepDef } from './chain.js'
import { after } from './theatre.js'
import { cx, formatWhen } from './util.js'

export type ApprovalChainProps = {
  title: string
  /** Who asked. Their own decision never counts. */
  requester: string
  startedAt: string
  steps: ChainStepDef[]
  decisions: ChainDecision[]
  now?: string | Date
  className?: string
}

const STATUS: Record<ChainStatus, { word: string; tone?: 'good' | 'warn' | 'bad' }> = {
  approved: { word: 'Approved', tone: 'good' },
  rejected: { word: 'Rejected', tone: 'bad' },
  waiting: { word: 'Waiting', tone: 'warn' },
  overdue: { word: 'Late', tone: 'bad' },
  invalid: { word: 'Not counted', tone: 'bad' },
  upcoming: { word: 'Not yet' },
  skipped: { word: 'Skipped' },
}

const left = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60000)
  const t = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
  return ms < 0 ? `${t} late` : `${t} left`
}

/**
 * Who has to approve, in order, and who is being waited on. Each step has a time limit. A decision from the person
 * who asked, from someone who is not the named approver, or from someone who already approved an earlier step does
 * not count, and the step says why.
 */
export function ApprovalChain({ title, requester, startedAt, steps, decisions, now, className }: ApprovalChainProps) {
  const r = judgeChain({ requester, startedAt, steps, decisions, now })
  const tone = r.outcome === 'approved' ? 'good' : r.outcome === 'waiting' ? 'warn' : 'bad'
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={tone}>{r.outcome === 'overdue' ? 'Late' : r.outcome === 'waiting' ? 'In progress' : r.outcome === 'approved' ? 'Approved' : 'Rejected'}</span>
      </div>
      <p className="ol-sub" style={{ margin: '0 0 8px' }}>{r.text}</p>
      {r.problem && <p className="ol-sub ol-gap-note" style={{ margin: '0 0 8px' }}>{r.problem}</p>}
      <ol className="ol-achain">
        {r.steps.map((s, i) => (
          <li key={s.def.id} className="ol-astep ol-in" style={after(i)} data-status={s.status} aria-current={r.currentId === s.def.id ? 'step' : undefined}>
            <span className={cx('ol-aknob', s.status === 'waiting' && 'ol-now')} aria-hidden="true">{i + 1}</span>
            <span className="ol-abody">
              <span><b>{s.def.who ?? s.def.role}</b>{s.def.who && <span className="ol-sub"> {s.def.role}</span>}</span>
              {s.decision && <span className="ol-sub">{s.decision.decision === 'approve' ? 'Approved' : 'Rejected'} by {s.decision.by}, {formatWhen(s.decision.at)}</span>}
              {s.leftMs !== undefined && <span className="ol-sub">{left(s.leftMs)}{s.status === 'overdue' && s.def.escalateTo ? `, goes to ${s.def.escalateTo}` : ''}</span>}
              {s.why && <span className="ol-achainwhy">{s.why}</span>}
            </span>
            <span className="ol-pill" data-tone={STATUS[s.status].tone}>{STATUS[s.status].word}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
