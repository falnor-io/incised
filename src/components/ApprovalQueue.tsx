import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cannotDecide, judgeItem, planDigest, RISK_ORDER, STATUS_ORDER, type Decision, type DecisionKind, type ItemStatus, type QueueItem } from './approval.js'
import { formatDuration } from './chart.js'
import { JsonTree } from './JsonTree.js'
import { cx, formatWhen } from './util.js'

export type { QueueItem, Decision, DecisionKind }
export type ApprovalQueueProps = {
  title: string
  items: QueueItem[]
  /** Who is looking. They cannot decide their own requests or decide twice. */
  reviewer: string
  now?: string | Date
  /** Hide other reviewers' decisions until this reviewer has decided, so a second approval is an independent one. */
  blind?: boolean
  onDecide?: (id: string, decision: DecisionKind, planHash: string) => void
  defaultSelected?: string
  className?: string
}

const STATUS_WORD: Record<ItemStatus, { text: string; tone?: 'good' | 'warn' | 'bad' }> = {
  pending: { text: 'Waiting', tone: 'warn' }, partial: { text: 'Needs another approval', tone: 'warn' }, approved: { text: 'Approved', tone: 'good' },
  rejected: { text: 'Rejected', tone: 'bad' }, escalated: { text: 'Escalated', tone: 'good' }, expired: { text: 'Expired', tone: 'bad' }, stale: { text: 'Plan changed', tone: 'bad' },
}

/**
 * A review queue where an approval is bound to the exact plan. The plan is hashed, every decision records the
 * hash it was made on, and a decision on an older version stops counting the moment the plan changes. Buttons
 * say what will happen, the page says whether it can be undone and what evidence was checked, a second
 * approval must come from a different person, and anything not decided in time expires instead of going through.
 */
export function ApprovalQueue({ title, items, reviewer, now, blind = false, onDecide, defaultSelected, className }: ApprovalQueueProps) {
  const clock = now ? new Date(now) : new Date()
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [local, setLocal] = useState<Record<string, Decision[]>>({})
  const [selected, setSelected] = useState<string | undefined>(defaultSelected ?? items[0]?.id)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    Promise.all(items.map(async (i) => [i.id, await planDigest(i.plan)] as const)).then((pairs) => { if (live) setHashes(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [items])

  const full = useMemo(() => items.map((i) => ({ ...i, decisions: [...i.decisions, ...(local[i.id] ?? [])] })), [items, local])
  const rows = full.map((item) => ({ item, hash: hashes[item.id], judged: hashes[item.id] ? judgeItem(item, hashes[item.id]!, clock) : null }))
  const ordered = [...rows].sort((a, b) => (a.judged ? STATUS_ORDER[a.judged.status] : 1) - (b.judged ? STATUS_ORDER[b.judged.status] : 1) || RISK_ORDER[a.item.risk] - RISK_ORDER[b.item.risk])
  const cur = ordered.find((r) => r.item.id === selected) ?? ordered[0]
  const open = ordered.filter((r) => r.judged && ['pending', 'partial', 'stale'].includes(r.judged.status)).length

  const decide = (kind: DecisionKind) => {
    if (!cur?.hash || !cur.judged || cannotDecide(cur.item, cur.judged, reviewer)) return
    const d: Decision = { by: reviewer, decision: kind, at: clock.toISOString(), planHash: cur.hash }
    setLocal((l) => ({ ...l, [cur.item.id]: [...(l[cur.item.id] ?? []), d] }))
    onDecide?.(cur.item.id, kind, cur.hash)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input,textarea,button[role="treeitem"],.ic-json')) return
    const i = ordered.findIndex((r) => r.item.id === cur?.item.id)
    const k = e.key.toLowerCase()
    if (k === 'j' || e.key === 'ArrowDown') setSelected(ordered[Math.min(ordered.length - 1, i + 1)]?.item.id)
    else if (k === 'k' || e.key === 'ArrowUp') setSelected(ordered[Math.max(0, i - 1)]?.item.id)
    else if (k === 'a') decide('approve')
    else if (k === 'r') decide('reject')
    else if (k === 'e') decide('escalate')
    else return
    e.preventDefault()
  }

  const blocked = cur?.judged ? cannotDecide(cur.item, cur.judged, reviewer) : 'Checking the plan…'
  const mine = cur?.judged?.valid.some((d) => d.by === reviewer)
  const hideOthers = blind && cur && !mine && cur.item.needs > 1 && reviewer !== cur.item.requester
  const left = cur?.item.expiresAt ? new Date(cur.item.expiresAt).getTime() - clock.getTime() : null

  return (
    <section className={cx('ic ic-queue', className)} aria-label={title}>
      <div className="ic-head-row">
        <div>
          <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ic-sub">{open} waiting for a decision · you are {reviewer}</div>
        </div>
        <span className="ic-sub">J / K move · A approve · R reject · E escalate</span>
      </div>
      <div className="ic-queue-body" ref={body} tabIndex={0} onKeyDown={onKey} aria-label="Approval queue. J and K move, A approves, R rejects, E escalates.">
        <ul className="ic-list ic-qlist" role="listbox" aria-label="Requests">
          {ordered.map(({ item, judged }) => {
            const s = judged ? STATUS_WORD[judged.status] : { text: 'Checking…' as string, tone: undefined }
            return (
              <li key={item.id} role="option" aria-selected={cur?.item.id === item.id} data-selected={cur?.item.id === item.id} className="ic-qitem" onClick={() => { setSelected(item.id); body.current?.focus() }}>
                <i className="ic-risk" data-risk={item.risk} title={`${item.risk} risk`} />
                <div className="ic-qmain">
                  <div className="ic-qtitle"><b>{item.action}</b></div>
                  <div className="ic-sub ic-ell">{item.requester}{item.amountLabel ? ` · ${item.amountLabel}` : ''}</div>
                  <span className="ic-pill" data-tone={s.tone} style={{ marginTop: 4 }}>{s.text}</span>
                </div>
              </li>
            )
          })}
        </ul>

        {cur && (
          <div className="ic-qdetail" aria-live="polite">
            <div className="ic-head-row" style={{ marginBottom: 4 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{cur.item.action}</strong>
                <div className="ic-sub">Asked by {cur.item.requester}{cur.item.amountLabel ? ` · ${cur.item.amountLabel}` : ''} · {cur.item.risk} risk</div>
              </div>
              {cur.judged && <span className="ic-pill" data-tone={STATUS_WORD[cur.judged.status].tone}>{STATUS_WORD[cur.judged.status].text}</span>}
            </div>
            <p style={{ margin: '6px 0' }}>{cur.item.summary}</p>
            {cur.judged && <p className="ic-statusline" data-status={cur.judged.status}>{cur.judged.reason}</p>}

            <div className="ic-qgrid">
              <div>
                <div className="ic-qhead">What will happen</div>
                <JsonTree value={cur.item.plan} label="plan" defaultExpandDepth={2} />
                <div className="ic-sub ic-mono" style={{ marginTop: 6 }} title="Your approval is bound to this exact plan. If it changes, the approval stops counting.">
                  Approval is bound to plan <b>{cur.hash ? cur.hash.slice(0, 16) : '…'}</b>
                </div>
              </div>
              <div>
                <div className="ic-qhead">Evidence checked</div>
                <ul className="ic-list ic-evidence">
                  {cur.item.evidence.map((e) => (
                    <li key={e.label} data-ok={e.ok}><span aria-hidden="true">{e.ok ? '✓' : '✗'}</span><span><span className="ic-sr">{e.ok ? 'Passed: ' : 'Failed: '}</span>{e.label}{e.detail && <span className="ic-sub"> · {e.detail}</span>}</span></li>
                  ))}
                </ul>
                <div className="ic-qhead" style={{ marginTop: 10 }}>If you approve</div>
                <p style={{ margin: 0 }}>
                  {cur.item.reversible === false ? <b className="ic-del">Cannot be undone.</b> : cur.item.reversible.undoUntil ? <>Can be undone until {formatWhen(cur.item.reversible.undoUntil)}.</> : 'Can be undone.'}
                  {left !== null && (left > 0 ? <span className="ic-sub"> Decide within {formatDuration(left)}, or it expires and nothing happens.</span> : <span className="ic-sub"> It expired.</span>)}
                </p>
              </div>
            </div>

            <div className="ic-qhead" style={{ marginTop: 12 }}>Decisions · {cur.judged?.valid.filter((d) => d.decision === 'approve').length ?? 0} of {cur.item.needs} approvals needed{cur.item.needs > 1 ? ', from different people' : ''}</div>
            {hideOthers ? <p className="ic-sub" style={{ margin: '4px 0 0' }}>Other reviewers' decisions are hidden until you decide, so yours is your own judgement.</p> : (
              <ul className="ic-list ic-dlog">
                {cur.item.decisions.length === 0 && <li className="ic-sub">No decisions yet.</li>}
                {cur.item.decisions.map((d, i) => {
                  const bad = cur.judged?.ignored.find((x) => x.decision === d)
                  return <li key={i} data-ignored={!!bad}><b>{d.by}</b> {d.decision === 'approve' ? 'approved' : d.decision === 'reject' ? 'rejected' : 'escalated'} <span className="ic-sub">{formatWhen(d.at)}</span> <span className="ic-mono ic-sub">{d.planHash.slice(0, 8)}</span>{bad && <span className="ic-ignored"> · does not count: {bad.why}</span>}</li>
                })}
              </ul>
            )}

            <div className="ic-actions">
              <button type="button" className="ic-btn" data-kind="approve" disabled={!!blocked} onClick={() => decide('approve')}>{cur.item.approveLabel ?? `Approve: ${cur.item.action}`}</button>
              <button type="button" className="ic-btn" data-kind="reject" disabled={!!blocked} onClick={() => decide('reject')}>Reject, do nothing</button>
              <button type="button" className="ic-btn" disabled={!!blocked} onClick={() => decide('escalate')}>Escalate to someone with more authority</button>
            </div>
            {blocked && <p className="ic-sub" style={{ margin: '6px 0 0' }}>{blocked}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
