// Maps a LangGraph / LangChain human-in-the-loop interrupt to approval queue items and back. The point: the reviewer
// sees the exact tool call the agent paused on, and what goes back is only what the reviewer decided. Nothing is
// invented on the way in: no evidence is made up, and an action not known to be undoable is shown as not undoable.
import type { Decision, DecisionKind, QueueItem } from '../components/approval.js'

/** What `stream.interrupt.value` holds for the built-in human-in-the-loop middleware. */
export type HitlRequest = {
  actionRequests: { name: string; args: Record<string, unknown>; description?: string }[]
  reviewConfigs: { allowedDecisions: ('approve' | 'reject' | 'edit' | 'respond')[] }[]
}
export type HitlDecision =
  | { type: 'approve' }
  | { type: 'reject'; message?: string }
  | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
  | { type: 'respond'; message: string }
export type HitlResponse = { decisions: HitlDecision[] }

export type FromInterruptOptions = {
  /** An id for this interrupt. Items are named `<id>:0`, `<id>:1` and so on. */
  id: string
  /** Who the reviewer sees as having asked. Defaults to "agent". */
  requester?: string
  /** LangChain does not say how risky a call is. Defaults to "medium". */
  risk?: (name: string) => QueueItem['risk']
  /** LangChain does not say whether a call can be undone. Anything you do not say is shown as not undoable. */
  reversible?: (name: string) => QueueItem['reversible']
  expiresAt?: string
}

const words = (n: string) => n.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The plan an item carries for one action request. It is what gets hashed, so an edit to it is a new plan. */
export type CallPlan = { tool: string; args: Record<string, unknown> }

export function itemsFromInterrupt(req: HitlRequest, o: FromInterruptOptions): QueueItem[] {
  return req.actionRequests.map((a, i) => {
    const allowedDecisions = req.reviewConfigs[i]?.allowedDecisions ?? ['approve', 'reject']
    const allowed: DecisionKind[] = []
    if (allowedDecisions.includes('approve') || allowedDecisions.includes('edit')) allowed.push('approve')
    if (allowedDecisions.includes('reject')) allowed.push('reject')
    if (allowedDecisions.includes('respond')) allowed.push('respond')
    const plan: CallPlan = { tool: a.name, args: a.args }
    return {
      id: `${o.id}:${i}`,
      action: words(a.name),
      summary: a.description ?? `The agent paused before running ${words(a.name)}.`,
      requester: o.requester ?? 'agent',
      risk: o.risk?.(a.name) ?? 'medium',
      plan,
      expiresAt: o.expiresAt,
      evidence: [],
      reversible: o.reversible?.(a.name) ?? false,
      needs: 1,
      decisions: [],
      allowed,
      editable: allowedDecisions.includes('edit'),
    }
  })
}

export type ReviewerDecision = { kind: DecisionKind; message?: string }
export type ToResponseResult = { ok: true; response: HitlResponse } | { ok: false; problem: string }

/**
 * Builds the value to resume the graph with, from what the reviewer decided on each item. It refuses to answer for a
 * reviewer: an item with no decision, or a decision the interrupt did not allow, is a problem, not a guess. An approval
 * of a plan whose arguments were edited becomes an `edit`. Escalating has no LangChain equivalent, so it is sent as a
 * rejection that says so.
 */
export function responseFromDecisions(req: HitlRequest, id: string, items: QueueItem[], decisions: Record<string, ReviewerDecision | Decision | undefined>): ToResponseResult {
  const out: HitlDecision[] = []
  for (let i = 0; i < req.actionRequests.length; i++) {
    const action = req.actionRequests[i]!
    const key = `${id}:${i}`
    const d = decisions[key]
    const kind = d ? ('kind' in d ? d.kind : d.decision) : undefined
    const message = d?.message
    if (!kind) return { ok: false, problem: `No decision yet for ${words(action.name)}.` }
    const allowed = req.reviewConfigs[i]?.allowedDecisions ?? ['approve', 'reject']
    if (kind === 'approve') {
      const plan = items.find((x) => x.id === key)?.plan as CallPlan | undefined
      if (plan && !same(plan.args, action.args)) {
        if (!allowed.includes('edit')) return { ok: false, problem: `Editing ${words(action.name)} is not allowed here.` }
        out.push({ type: 'edit', editedAction: { name: action.name, args: plan.args } })
      } else if (allowed.includes('approve')) out.push({ type: 'approve' })
      else return { ok: false, problem: `Approving ${words(action.name)} is not allowed here.` }
    } else if (kind === 'reject') {
      if (!allowed.includes('reject')) return { ok: false, problem: `Rejecting ${words(action.name)} is not allowed here.` }
      out.push({ type: 'reject', ...(message ? { message } : {}) })
    } else if (kind === 'respond') {
      if (!allowed.includes('respond')) return { ok: false, problem: `Replying to ${words(action.name)} is not allowed here.` }
      if (!message) return { ok: false, problem: `Write the reply for ${words(action.name)}.` }
      out.push({ type: 'respond', message })
    } else {
      if (!allowed.includes('reject')) return { ok: false, problem: `Escalating ${words(action.name)} needs a rejection, which is not allowed here.` }
      out.push({ type: 'reject', message: message ?? 'Escalated to someone with more authority. Do not run this.' })
    }
  }
  return { ok: true, response: { decisions: out } }
}
