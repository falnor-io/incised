// Rules for an approval queue. The point of each: an approval must be about the exact thing that happens.
import { canonical, sha256Hex } from '../verify/canonical.js'

export type DecisionKind = 'approve' | 'reject' | 'escalate'
export type Decision = { by: string; decision: DecisionKind; at: string; planHash: string }
export type QueueItem = {
  id: string
  action: string
  summary: string
  requester: string
  amountLabel?: string
  risk: 'low' | 'medium' | 'high'
  /** The exact thing that will happen if this is approved. Its hash is what an approval is bound to. */
  plan: unknown
  expiresAt?: string
  evidence: { label: string; ok: boolean; detail?: string }[]
  /** `false` means it cannot be undone. */
  reversible: { undoUntil?: string } | false
  /** Approvals needed from different people. */
  needs: number
  decisions: Decision[]
  approveLabel?: string
}
export type ItemStatus = 'pending' | 'partial' | 'approved' | 'rejected' | 'escalated' | 'expired' | 'stale'
export type Judged = { status: ItemStatus; valid: Decision[]; ignored: { decision: Decision; why: string }[]; reason: string }

export const planDigest = (plan: unknown) => sha256Hex(canonical(plan))

/**
 * Works out where an item stands. A decision only counts if it was made on the plan as it is now, was made by
 * someone other than the requester, and is the first from that person. A person's earlier approval of an old
 * version of the plan never counts toward the new one.
 */
export function judgeItem(item: QueueItem, currentHash: string, now: Date): Judged {
  const valid: Decision[] = []
  const ignored: Judged['ignored'] = []
  const seen = new Set<string>()
  for (const d of item.decisions) {
    if (d.planHash !== currentHash) ignored.push({ decision: d, why: 'The plan changed after this decision, so it no longer counts.' })
    else if (d.by === item.requester) ignored.push({ decision: d, why: 'The person who asked cannot approve their own request.' })
    else if (seen.has(d.by)) ignored.push({ decision: d, why: 'This person already decided.' })
    else {
      seen.add(d.by)
      valid.push(d)
    }
  }
  const approvals = valid.filter((d) => d.decision === 'approve').length
  const staleApprovals = ignored.filter((i) => i.decision.decision === 'approve' && i.why.startsWith('The plan changed')).length
  const need = Math.max(1, item.needs)
  if (valid.some((d) => d.decision === 'reject')) return { status: 'rejected', valid, ignored, reason: 'A reviewer rejected this.' }
  if (approvals >= need) return { status: 'approved', valid, ignored, reason: `${approvals} of ${need} approvals, all on the current plan.` }
  if (valid.some((d) => d.decision === 'escalate')) return { status: 'escalated', valid, ignored, reason: 'Handed to someone with more authority.' }
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) return { status: 'expired', valid, ignored, reason: 'Nobody decided in time, so nothing happens.' }
  if (staleApprovals > 0) return { status: 'stale', valid, ignored, reason: `${staleApprovals} earlier ${staleApprovals === 1 ? 'approval was' : 'approvals were'} for a different version of the plan. Review it again.` }
  if (approvals > 0) return { status: 'partial', valid, ignored, reason: `${approvals} of ${need} approvals. ${need - approvals} more from a different person.` }
  return { status: 'pending', valid, ignored, reason: need > 1 ? `Needs ${need} approvals from different people.` : 'Waiting for a decision.' }
}

/** Why this person cannot decide right now, or null if they can. */
export function cannotDecide(item: QueueItem, judged: Judged, reviewer: string): string | null {
  if (judged.status === 'approved' || judged.status === 'rejected' || judged.status === 'escalated') return 'This is already decided.'
  if (judged.status === 'expired') return 'This expired. Ask for it again.'
  if (reviewer === item.requester) return 'You asked for this, so someone else has to decide.'
  if (judged.valid.some((d) => d.by === reviewer)) return 'You have already decided on this plan.'
  return null
}

export const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const
export const STATUS_ORDER: Record<ItemStatus, number> = { stale: 0, pending: 1, partial: 2, expired: 3, escalated: 4, approved: 5, rejected: 6 }
