// Rules for an approval chain. The point of each: who is being waited on, and whether they are late, comes from the
// steps, the decisions and the clock. A decision from the wrong person never counts.

export type ChainStepDef = {
  id: string
  role: string
  /** The named approver. If set, only this person's decision counts. */
  who?: string
  /** How long this step has before it is late. */
  timeoutMin: number
  /** Who it goes to when this step is late. */
  escalateTo?: string
}
export type ChainDecision = { stepId: string; by: string; decision: 'approve' | 'reject'; at: string }
export type ChainStatus = 'approved' | 'rejected' | 'waiting' | 'overdue' | 'invalid' | 'upcoming' | 'skipped'
export type ChainStep = {
  def: ChainStepDef
  status: ChainStatus
  decision?: ChainDecision
  /** When this step started waiting: the start of the chain, or the previous approval. */
  openedAt?: string
  /** Milliseconds until it is late. Negative when it is late. */
  leftMs?: number
  why?: string
}
export type ChainOutcome = 'approved' | 'rejected' | 'waiting' | 'overdue'
export type ChainReport = { steps: ChainStep[]; outcome: ChainOutcome; currentId?: string; text: string }

export function judgeChain(input: { requester: string; startedAt: string; steps: ChainStepDef[]; decisions: ChainDecision[]; now?: string | Date }): ChainReport {
  const now = (input.now ? new Date(input.now) : new Date()).getTime()
  const approvers = new Set<string>()
  const out: ChainStep[] = []
  let opened = new Date(input.startedAt).getTime()
  let stopped: ChainOutcome | null = null
  let currentId: string | undefined
  for (const def of input.steps) {
    if (stopped === 'rejected') { out.push({ def, status: 'skipped' }); continue }
    if (stopped) { out.push({ def, status: 'upcoming' }); continue }
    const mine = input.decisions.filter((d) => d.stepId === def.id).sort((a, b) => a.at.localeCompare(b.at))
    let why: string | undefined
    let won: ChainDecision | undefined
    for (const d of mine) {
      if (d.by === input.requester) why ||= 'The person who asked cannot approve their own request.'
      else if (def.who && d.by !== def.who) why ||= `Only ${def.who} can decide this step.`
      else if (approvers.has(d.by)) why ||= 'This person already approved an earlier step.'
      else { won = d; break }
    }
    if (won) {
      approvers.add(won.by)
      out.push({ def, status: won.decision === 'approve' ? 'approved' : 'rejected', decision: won, openedAt: new Date(opened).toISOString() })
      if (won.decision === 'reject') stopped = 'rejected'
      else opened = new Date(won.at).getTime()
      continue
    }
    const leftMs = opened + def.timeoutMin * 60000 - now
    const status: ChainStatus = leftMs < 0 ? 'overdue' : why ? 'invalid' : 'waiting'
    out.push({ def, status, openedAt: new Date(opened).toISOString(), leftMs, why })
    currentId = def.id
    stopped = leftMs < 0 ? 'overdue' : 'waiting'
  }
  const outcome: ChainOutcome = stopped ?? 'approved'
  return { steps: out, outcome, currentId, text: describe(outcome, out) }
}

function minutes(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

function describe(outcome: ChainOutcome, steps: ChainStep[]): string {
  const cur = steps.find((s) => s.status === 'waiting' || s.status === 'overdue' || s.status === 'invalid')
  const rejected = steps.find((s) => s.status === 'rejected')
  if (outcome === 'approved') return `Approved by ${steps.length} ${steps.length === 1 ? 'person' : 'people'}, in order.`
  if (outcome === 'rejected') return `Rejected by ${rejected?.decision?.by ?? rejected?.def.role}. The later steps do not run.`
  if (!cur) return 'Waiting.'
  const who = cur.def.who ?? cur.def.role
  if (outcome === 'overdue') return `${who} has not answered in time${cur.def.escalateTo ? `, so it goes to ${cur.def.escalateTo}` : ''}.`
  return `Waiting on ${who}, ${minutes(cur.leftMs ?? 0)} left.`
}
