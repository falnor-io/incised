'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cannotDecide, DEFAULT_ALLOWED, judgeItem, planDigest, RISK_ORDER, STATUS_ORDER, type Decision, type DecisionKind, type ItemStatus, type QueueItem } from './approval.js'
import { formatDuration } from './chart.js'
import { Check, Cross } from './icons.js'
import { JsonTree } from './JsonTree.js'
import { after } from './theatre.js'
import { ReviewActions } from './ReviewActions.js'
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
  onDecide?: (id: string, decision: DecisionKind, planHash: string, message?: string) => void
  /** Called with the edited plan when a reviewer saves a change to it. The plan, and so the hash every approval is bound to, is now the new one. */
  onEdit?: (id: string, plan: unknown) => void
  defaultSelected?: string
  /** Called with the id of the request being shown, including the first one on load. */
  onSelect?: (id: string) => void
  className?: string
}

const STATUS_WORD: Record<ItemStatus, { text: string; tone?: 'good' | 'warn' | 'bad' }> = {
  pending: { text: 'Waiting', tone: 'warn' }, partial: { text: 'Needs another approval', tone: 'warn' }, approved: { text: 'Approved', tone: 'good' },
  rejected: { text: 'Rejected', tone: 'bad' }, escalated: { text: 'Escalated', tone: 'good' }, responded: { text: 'Answered, nothing ran', tone: 'warn' }, expired: { text: 'Expired', tone: 'bad' }, stale: { text: 'Plan changed', tone: 'bad' },
}

/**
 * A review queue where an approval is bound to the exact plan. The plan is hashed, every decision records the
 * hash it was made on, and a decision on an older version stops counting the moment the plan changes. Buttons
 * say what will happen, the page says whether it can be undone and what evidence was checked, a second
 * approval must come from a different person, and anything not decided in time expires instead of going through.
 */
export function ApprovalQueue({ title, items, reviewer, now, blind = false, onDecide, onEdit, defaultSelected, onSelect, className }: ApprovalQueueProps) {
  const clock = now ? new Date(now) : new Date()
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [local, setLocal] = useState<Record<string, Decision[]>>({})
  const [selected, setSelected] = useState<string | undefined>(defaultSelected ?? items[0]?.id)
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const body = useRef<HTMLDivElement>(null)
  const seenPlans = useRef<Record<string, unknown>>({})

  // When the host hands back a different plan for an item, its own version wins over a local edit.
  useEffect(() => {
    const changed = items.filter((i) => i.id in seenPlans.current && seenPlans.current[i.id] !== i.plan).map((i) => i.id)
    seenPlans.current = Object.fromEntries(items.map((i) => [i.id, i.plan]))
    if (changed.length) setEdits((e) => Object.fromEntries(Object.entries(e).filter(([id]) => !changed.includes(id))))
  }, [items])

  const planned = useMemo(() => items.map((i) => (i.id in edits ? { ...i, plan: edits[i.id] } : i)), [items, edits])
  useEffect(() => {
    let live = true
    Promise.all(planned.map(async (i) => [i.id, await planDigest(i.plan)] as const)).then((pairs) => { if (live) setHashes(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [planned])

  const full = useMemo(() => planned.map((i) => ({ ...i, decisions: [...i.decisions, ...(local[i.id] ?? [])] })), [planned, local])
  const rows = full.map((item) => ({ item, hash: hashes[item.id], judged: hashes[item.id] ? judgeItem(item, hashes[item.id]!, clock) : null }))
  const ordered = [...rows].sort((a, b) => (a.judged ? STATUS_ORDER[a.judged.status] : 1) - (b.judged ? STATUS_ORDER[b.judged.status] : 1) || RISK_ORDER[a.item.risk] - RISK_ORDER[b.item.risk])
  const cur = ordered.find((r) => r.item.id === selected) ?? ordered[0]
  const shownId = cur?.item.id
  useEffect(() => { if (shownId) onSelect?.(shownId) }, [shownId]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = ordered.filter((r) => r.judged && ['pending', 'partial', 'stale'].includes(r.judged.status)).length

  const allowed = cur?.item.allowed ?? DEFAULT_ALLOWED
  const decide = (kind: DecisionKind, message?: string) => {
    if (!cur?.hash || !cur.judged || cannotDecide(cur.item, cur.judged, reviewer) || !allowed.includes(kind)) return
    const d: Decision = { by: reviewer, decision: kind, at: clock.toISOString(), planHash: cur.hash, ...(message && (kind === 'respond' || kind === 'reject') ? { message } : {}) }
    setLocal((l) => ({ ...l, [cur.item.id]: [...(l[cur.item.id] ?? []), d] }))
    onDecide?.(cur.item.id, kind, cur.hash, d.message)
  }
  const edit = (plan: unknown) => {
    if (!cur) return
    setEdits((e) => ({ ...e, [cur.item.id]: plan }))
    onEdit?.(cur.item.id, plan)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input,textarea,button[role="treeitem"],.ol-json')) return
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
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ol-sub">{open} waiting for a decision · you are {reviewer}</div>
        </div>
      </div>
      <div className="ol-queue-body" ref={body} tabIndex={0} onKeyDown={onKey} aria-label="Approval queue. J and K move, A approves, R rejects, E escalates.">
        <ul className="ol-list ol-qlist" role="listbox" aria-label="Requests">
          {ordered.map(({ item, judged }, idx) => {
            const s = judged ? STATUS_WORD[judged.status] : { text: 'Checking…' as string, tone: undefined }
            return (
              <li key={item.id} role="option" aria-selected={cur?.item.id === item.id} data-selected={cur?.item.id === item.id} className="ol-qitem ol-in" style={after(idx)} onClick={() => { setSelected(item.id); body.current?.focus() }}>
                <i className="ol-risk" data-risk={item.risk} aria-hidden="true" title={`${item.risk} risk`} />
                <span className="ol-sr">{item.risk} risk. </span>
                <div className="ol-qmain">
                  <div className="ol-qtitle"><b>{item.action}</b></div>
                  <div className="ol-sub ol-ell">{item.requester}{item.amountLabel ? ` · ${item.amountLabel}` : ''}</div>
                  <span className="ol-pill" data-tone={s.tone} style={{ marginTop: 4 }}>{s.text}</span>
                </div>
              </li>
            )
          })}
        </ul>

        {cur && (
          <div className="ol-qdetail" aria-live="polite">
            <div className="ol-head-row" style={{ marginBottom: 4 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{cur.item.action}</strong>
                <div className="ol-sub">Asked by {cur.item.requester}{cur.item.amountLabel ? ` · ${cur.item.amountLabel}` : ''} · {cur.item.risk} risk</div>
              </div>
              {cur.judged && <span className="ol-pill" data-tone={STATUS_WORD[cur.judged.status].tone}>{STATUS_WORD[cur.judged.status].text}</span>}
            </div>
            <p style={{ margin: '6px 0' }}>{cur.item.summary}</p>
            {cur.judged && <p className="ol-statusline" data-status={cur.judged.status}>{cur.judged.reason}</p>}

            <div className="ol-qgrid">
              <div>
                <div className="ol-qhead">What will happen</div>
                <JsonTree value={cur.item.plan} label="plan" defaultExpandDepth={2} />
                <div className="ol-sub" style={{ marginTop: 6 }} title="Your approval is bound to this exact plan. If the plan changes, the approval stops counting.">
                  Bound to plan <b className="ol-id">{cur.hash ? cur.hash.slice(0, 12) : '…'}</b>
                </div>
              </div>
              <div>
                <div className="ol-qhead">Evidence checked</div>
                <ul className="ol-list ol-evidence">
                  {cur.item.evidence.map((e) => (
                    <li key={e.label} data-ok={e.ok}><span aria-hidden="true">{e.ok ? <Check /> : <Cross />}</span><span><span className="ol-sr">{e.ok ? 'Passed: ' : 'Failed: '}</span>{e.label}{e.detail && <span className="ol-sub"> · {e.detail}</span>}</span></li>
                  ))}
                </ul>
                <div className="ol-qhead" style={{ marginTop: 10 }}>If you approve</div>
                <p style={{ margin: 0 }} className="ol-chips">
                  {cur.item.reversible === false ? <span className="ol-pill" data-tone="bad">Cannot be undone</span> : <span className="ol-pill">{cur.item.reversible.undoUntil ? `Undo until ${formatWhen(cur.item.reversible.undoUntil)}` : 'Can be undone'}</span>}
                  {left !== null && <span className="ol-pill" data-tone={left > 0 ? 'warn' : 'bad'} title="If nobody decides in time it expires and nothing happens.">{left > 0 ? `Expires in ${formatDuration(left)}` : 'Expired'}</span>}
                </p>
              </div>
            </div>

            <div className="ol-qhead" style={{ marginTop: 12 }}>Approvals {cur.judged?.valid.filter((d) => d.decision === 'approve').length ?? 0} of {cur.item.needs}</div>
            {hideOthers ? <p className="ol-sub" style={{ margin: '4px 0 0' }}>Other reviewers' decisions are hidden until you decide, so yours is your own judgement.</p> : (
              <ul className="ol-list ol-dlog">
                {cur.item.decisions.length === 0 && <li className="ol-sub">No decisions yet.</li>}
                {cur.item.decisions.map((d, i) => {
                  const bad = cur.judged?.ignored.find((x) => x.decision === d)
                  return <li key={i} data-ignored={!!bad}><b>{d.by}</b> {d.decision === 'approve' ? 'approved' : d.decision === 'reject' ? 'rejected' : d.decision === 'respond' ? 'answered' : 'escalated'} <span className="ol-sub">{formatWhen(d.at)}</span> <span className="ol-id ol-sub">{d.planHash.slice(0, 8)}</span>{d.message && <span className="ol-sub"> · "{d.message}"</span>}{bad && <span className="ol-ignored"> · does not count: {bad.why}</span>}</li>
                })}
              </ul>
            )}

            <ReviewActions key={cur.item.id + (cur.hash ?? '')} allowed={allowed} editable={!!cur.item.editable} approveLabel={cur.item.approveLabel ?? `Approve: ${cur.item.action}`} blocked={!!blocked} plan={cur.item.plan} onDecide={decide} onEdit={edit} />
            {blocked && <p className="ol-sub" style={{ margin: '6px 0 0' }}>{blocked}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
