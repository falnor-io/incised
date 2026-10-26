// Rules for setting a plan against what an agent did. The point of each: which steps ran, which did not, and which
// were never in the plan are counted from the two lists, never described by the agent.

export type PlanStep = { id: string; action: string }
export type ActualStatus = 'ok' | 'error' | 'blocked'
/** `planId` says which plan step this was meant to be. Without it, the first unmatched plan step with the same action is used. */
export type ActualStep = { id: string; action: string; status: ActualStatus; planId?: string }
export type StepState = 'done' | 'failed' | 'blocked' | 'skipped'
/** `ranAs` is the 1-based position of the matching step in the run. */
export type AlignedRow = { plan: PlanStep; actual?: ActualStep; state: StepState; outOfOrder: boolean; ranAs?: number }
export type PlanCounts = { planned: number; /** Done and in order. */ asPlanned: number; done: number; failed: number; blocked: number; skipped: number; outOfOrder: number; extra: number }
export type PlanReport = { rows: AlignedRow[]; extras: ActualStep[]; counts: PlanCounts; summary: string }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function alignPlan(plan: PlanStep[], actual: ActualStep[]): PlanReport {
  const matched = new Map<string, ActualStep>() // plan id -> actual
  const used = new Set<string>() // actual ids
  // Pass 1: the agent said which plan step this was.
  for (const a of actual) {
    if (!a.planId || matched.has(a.planId) || !plan.some((p) => p.id === a.planId)) continue
    matched.set(a.planId, a)
    used.add(a.id)
  }
  // Pass 2: match the rest by action name, in order.
  for (const a of actual) {
    if (used.has(a.id)) continue
    const p = plan.find((s) => !matched.has(s.id) && same(s.action, a.action))
    if (!p) continue
    matched.set(p.id, a)
    used.add(a.id)
  }
  // A plan step is out of order when it ran after a step that was planned later.
  const planIndex = new Map(plan.map((p, i) => [p.id, i]))
  const late = new Set<string>()
  let highest = -1
  for (const a of actual) {
    const p = plan.find((s) => matched.get(s.id) === a)
    if (!p) continue
    const i = planIndex.get(p.id)!
    if (i < highest) late.add(p.id)
    highest = Math.max(highest, i)
  }
  const rows = plan.map((p): AlignedRow => {
    const a = matched.get(p.id)
    const state: StepState = !a ? 'skipped' : a.status === 'ok' ? 'done' : a.status === 'error' ? 'failed' : 'blocked'
    return { plan: p, actual: a, state, outOfOrder: late.has(p.id), ranAs: a ? actual.indexOf(a) + 1 : undefined }
  })
  const extras = actual.filter((a) => !used.has(a.id))
  const count = (s: StepState) => rows.filter((r) => r.state === s).length
  const counts: PlanCounts = {
    planned: plan.length, asPlanned: rows.filter((r) => r.state === 'done' && !r.outOfOrder).length, done: count('done'), failed: count('failed'), blocked: count('blocked'), skipped: count('skipped'),
    outOfOrder: rows.filter((r) => r.outOfOrder).length, extra: extras.length,
  }
  return { rows, extras, counts, summary: summarize(counts, extras) }
}

function summarize(c: PlanCounts, extras: ActualStep[]): string {
  if (c.planned === 0) return extras.length ? `No plan was recorded. ${extras.length} ${extras.length === 1 ? 'step ran' : 'steps ran'}.` : 'No plan was recorded.'
  if (c.asPlanned === c.planned && !c.extra) return 'Every planned step ran, in order.'
  const parts: string[] = []
  if (c.skipped) parts.push(`${c.skipped} skipped`)
  if (c.failed) parts.push(`${c.failed} failed`)
  if (c.blocked) parts.push(`${c.blocked} blocked`)
  if (c.outOfOrder) parts.push(`${c.outOfOrder} out of order`)
  if (c.extra) {
    const names = extras.slice(0, 2).map((e) => e.action).join(', ')
    parts.push(`${c.extra} not in the plan (${names}${extras.length > 2 ? ', and more' : ''})`)
  }
  return `${c.asPlanned} of ${c.planned} planned steps ran as planned` + (parts.length ? `: ${parts.join(', ')}.` : '.')
}
