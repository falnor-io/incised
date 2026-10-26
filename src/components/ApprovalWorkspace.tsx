'use client'

import { useState } from 'react'
import { ApprovalChain } from './ApprovalChain.js'
import { ApprovalQueue, type ApprovalQueueProps, type QueueItem } from './ApprovalQueue.js'
import type { ChainDecision, ChainStepDef } from './chain.js'
import { EvidenceTable } from './EvidenceTable.js'
import type { EvidenceRow } from './evidence.js'
import type { Handoff } from './handoff.js'
import { HandoffPacket } from './HandoffPacket.js'
import { cx } from './util.js'

/** A request and everything that can sit beside it. Each extra is optional. */
export type WorkspaceItem = {
  queue: QueueItem
  chain?: { startedAt: string; steps: ChainStepDef[]; decisions: ChainDecision[] }
  evidence?: EvidenceRow[]
  handoff?: Partial<Handoff>
}

export type ApprovalWorkspaceProps = {
  title: string
  items: WorkspaceItem[]
  reviewer: string
  now?: string | Date
  blind?: boolean
  onDecide?: ApprovalQueueProps['onDecide']
  onEdit?: ApprovalQueueProps['onEdit']
  className?: string
}

type Side = 'chain' | 'evidence' | 'handoff'
const LABEL: Record<Side, string> = { chain: 'Chain', evidence: 'Evidence', handoff: 'Handoff' }

/**
 * A review workspace: the queue on the left, and for the request you are looking at, who has to approve and who is
 * late, where each value came from, and what the agent handed over. A tab only appears when the request has that
 * part, so nothing is shown as empty.
 */
export function ApprovalWorkspace({ title, items, reviewer, now, blind, onDecide, onEdit, className }: ApprovalWorkspaceProps) {
  const [selected, setSelected] = useState<string | undefined>(items[0]?.queue.id)
  const [pick, setPick] = useState<Side | null>(null)
  const item = items.find((i) => i.queue.id === selected)
  const available: Side[] = [item?.chain && 'chain', item?.evidence && 'evidence', item?.handoff && 'handoff'].filter(Boolean) as Side[]
  const side: Side | undefined = pick && available.includes(pick) ? pick : available[0]
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-work">
        <ApprovalQueue title={title} items={items.map((i) => i.queue)} reviewer={reviewer} now={now} blind={blind} onDecide={onDecide} onEdit={onEdit} onSelect={setSelected} />
        <aside className="ol-workside" aria-label="About this request">
          {available.length === 0 ? (
            <p className="ol-sub" role="status">Nothing else came with this request.</p>
          ) : (
            <>
              <div className="ol-tabs" role="tablist" aria-label="About this request">
                {available.map((s) => (
                  <button key={s} type="button" role="tab" className="ol-tab" aria-selected={side === s} onClick={() => setPick(s)}>{LABEL[s]}</button>
                ))}
              </div>
              <div role="tabpanel" className="ol-runpanel">
                {side === 'chain' && item?.chain && <ApprovalChain title="Who has to approve" requester={item.queue.requester} startedAt={item.chain.startedAt} steps={item.chain.steps} decisions={item.chain.decisions} now={now} />}
                {side === 'evidence' && item?.evidence && <EvidenceTable title="Where the values came from" rows={item.evidence} />}
                {side === 'handoff' && item?.handoff && <HandoffPacket title="What the agent handed over" handoff={item.handoff} now={now} />}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
