// Rules for deciding when an agent has earned more autonomy. The point of each: the verdict comes from counted
// cases and an exact interval, never from a feeling, and a person still makes the promotion.
import { canonical, sha256Hex } from '../verify/canonical.js'
import { clopperPearson } from '../verify/stats.js'
import { pct } from './util.js'

export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

/** The five tiers from the arXiv agent reliability profile for financial services: what the agent does, and who is the fallback. */
export const TIERS: { id: Tier; name: string; does: string; fallback: string; person: string }[] = [
  { id: 'T0', name: 'Suggests', does: 'Reads and suggests. A person does the task.', fallback: 'The person is the operator', person: 'Does the task' },
  { id: 'T1', name: 'Assists', does: 'Helps with one action at a time, each started by a person.', fallback: 'The person, throughout', person: 'Starts each action' },
  { id: 'T2', name: 'Approved steps', does: 'Runs a multi-step task. A person approves every material action.', fallback: 'The person, throughout', person: 'Approves every material action' },
  { id: 'T3', name: 'Handles', does: 'Handles the whole task and asks for help on uncertainty or defined triggers.', fallback: 'A person, after a handoff', person: 'Answers when the agent asks' },
  { id: 'T4', name: 'Acts in bounds', does: 'Acts inside a fixed envelope with no live approval. Anything outside is blocked.', fallback: 'A tested safe state', person: 'Watches and audits' },
]

export const previousTier = (t: Tier): Tier | null => {
  const i = TIERS.findIndex((x) => x.id === t)
  return i > 0 ? TIERS[i - 1]!.id : null
}

export const nextTier = (t: Tier): Tier | null => {
  const i = TIERS.findIndex((x) => x.id === t)
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1]!.id : null
}

/** What the person did with what the agent proposed. `abstained` means the agent asked instead of proposing. */
export type Outcome = 'agree' | 'override' | 'abstained'
export type AutonomyCase = {
  id: string
  task?: string
  outcome: Outcome
  at?: string
  /** How long the person took to decide, in milliseconds. Used only to notice approvals made too fast to be a review. */
  reviewMs?: number
}
/** `rate` of cases agreed, with the interval's lower bound at or over it, across at least `minCases` cases. */
export type AutonomyRule = {
  rate: number
  minCases: number
  confidence?: number
  /** Step down when even the best-case estimate over the latest `recentWindow` cases misses `rate`. Defaults to 30 cases. */
  recentWindow?: number
  /** Tasks that must meet the rule on their own. One that does not, or has too few cases, blocks eligibility however good the total is. */
  critical?: string[]
  /** If more than `maxShare` of recent agreements took under `underMs`, the agreement is not a review and eligibility is blocked. */
  reviewFloor?: { underMs: number; maxShare: number }
  /** Things that must be true before a higher tier, such as monitoring or an incident process. Their state is your fact to report. */
  controls?: { label: string; done: boolean }[]
}

export type RecentWindow = { n: number; agree: number; observed: number; lower: number; upper: number }
export type TaskRow = { task: string; n: number; agree: number; observed: number; lower: number; upper: number; weak: boolean }
export type Judgement = {
  status: 'collecting' | 'stay' | 'ready' | 'demote'
  n: number
  agree: number
  override: number
  abstained: number
  observed: number
  lower: number
  upper: number
  /** The level actually used, after widening for repeated looks. */
  confidence: number
  looks: number
  need: number
  reason: string
  /** Why a pass is held back: critical tasks, missing controls, hurried approvals. Empty when nothing is. */
  blockers: string[]
  /** The latest cases only, which is what a step-down is judged on. */
  recent: RecentWindow | null
  /** Share of all cases where the agent asked instead of proposing, and share of proposals a person overrode. */
  askRate: number
  overrideRate: number
  hurried: { fast: number; of: number; underMs: number } | null
  tasks: TaskRow[]
  recentOverrides: AutonomyCase[]
}

const MIN_TASK_CASES = 5

/**
 * Judges a set of cases against a rule. Abstentions are not counted: the agent asked, so there was nothing to agree
 * with. Looking at the result again and again and promoting the first time it passes makes a false pass more likely,
 * so the allowed error is divided across the looks (a Bonferroni split) and the interval widens with each one.
 */
export function judgeAutonomy(cases: AutonomyCase[], rule: AutonomyRule, looks = 1, tier?: Tier): Judgement {
  const stated = rule.confidence ?? 0.95
  const lookCount = Math.max(1, Math.floor(looks))
  const confidence = Math.min(0.9999, 1 - (1 - stated) / lookCount)
  const counted = cases.filter((c) => c.outcome !== 'abstained')
  const agree = counted.filter((c) => c.outcome === 'agree').length
  const n = counted.length
  const interval = n > 0 ? clopperPearson(agree, n, confidence) : { lower: 0, upper: 1 }
  const need = Math.max(0, rule.minCases - n)

  const byTask = new Map<string, AutonomyCase[]>()
  for (const c of counted) byTask.set(c.task ?? 'All cases', [...(byTask.get(c.task ?? 'All cases') ?? []), c])
  const tasks: TaskRow[] = [...byTask.entries()]
    .map(([task, list]) => {
      const a = list.filter((c) => c.outcome === 'agree').length
      const iv = clopperPearson(a, list.length, confidence)
      return { task, n: list.length, agree: a, observed: a / list.length, lower: iv.lower, upper: iv.upper, weak: list.length >= MIN_TASK_CASES && a / list.length < rule.rate }
    })
    .sort((x, y) => Number(y.weak) - Number(x.weak) || x.observed - y.observed)

  const overrides = cases.filter((c) => c.outcome === 'override')
  const recentOverrides = [...overrides].sort((x, y) => (y.at ?? '').localeCompare(x.at ?? '')).slice(0, 3)

  const window = Math.max(1, Math.floor(rule.recentWindow ?? 30))
  const ordered = counted.every((c) => c.at) ? [...counted].sort((x, y) => x.at!.localeCompare(y.at!)) : counted
  const latest = ordered.slice(-window)
  let recent: RecentWindow | null = null
  if (latest.length > 0) {
    const ra = latest.filter((c) => c.outcome === 'agree').length
    const iv = clopperPearson(ra, latest.length, confidence)
    recent = { n: latest.length, agree: ra, observed: ra / latest.length, lower: iv.lower, upper: iv.upper }
  }

  let hurried: Judgement['hurried'] = null
  if (rule.reviewFloor) {
    const timed = latest.filter((c) => c.outcome === 'agree' && c.reviewMs !== undefined)
    if (timed.length > 0) hurried = { fast: timed.filter((c) => c.reviewMs! < rule.reviewFloor!.underMs).length, of: timed.length, underMs: rule.reviewFloor.underMs }
  }

  const blockers: string[] = []
  for (const name of rule.critical ?? []) {
    const row = tasks.find((t) => t.task === name)
    if (!row || row.n < MIN_TASK_CASES) blockers.push(`${name} is a critical task with ${row?.n ?? 0} of ${MIN_TASK_CASES} cases needed to judge it.`)
    else if (row.observed < rule.rate) blockers.push(`${name} is a critical task and agrees ${pct(row.observed, 0)} of the time, under the ${pct(rule.rate, 0)} rule.`)
  }
  const open = (rule.controls ?? []).filter((c) => !c.done)
  if (open.length) blockers.push(`Not in place yet: ${open.map((c) => c.label).join(', ')}.`)
  if (hurried && hurried.of >= 5 && hurried.fast / hurried.of > rule.reviewFloor!.maxShare) {
    blockers.push(`${hurried.fast} of the last ${hurried.of} timed approvals took under ${Math.round(hurried.underMs / 1000)} s, which is too fast to be a review.`)
  }

  let status: Judgement['status']
  let reason: string
  const stepDown = tier !== undefined && tier !== 'T0' && recent !== null && recent.n >= window && recent.upper < rule.rate
  if (stepDown) {
    status = 'demote'
    reason = `The latest ${recent!.n} cases agreed ${pct(recent!.observed, 0)}, and even the best case, ${pct(recent!.upper)}, is under the ${pct(rule.rate, 0)} rule. Step down until it recovers.`
  } else if (n < rule.minCases) {
    status = 'collecting'
    reason = `${n} of ${rule.minCases} cases so far. ${need} more before there is a verdict.`
  } else if (interval.lower >= rule.rate && blockers.length === 0) {
    status = 'ready'
    reason = `The lower bound is ${pct(interval.lower)}, at or over the ${pct(rule.rate, 0)} rule. A person still decides the promotion.`
  } else if (interval.lower >= rule.rate) {
    status = 'stay'
    reason = `The lower bound is ${pct(interval.lower)}, at or over the ${pct(rule.rate, 0)} rule, but something else has to be true first.`
  } else {
    status = 'stay'
    reason = `The lower bound is ${pct(interval.lower)}, under the ${pct(rule.rate, 0)} rule. More agreement or more cases would move it.`
  }
  return {
    status, n, agree, override: overrides.length, abstained: cases.length - n, observed: n ? agree / n : 0,
    lower: interval.lower, upper: interval.upper, confidence, looks: lookCount, need, reason, blockers, recent, hurried,
    askRate: cases.length ? (cases.length - n) / cases.length : 0, overrideRate: n ? overrides.length / n : 0, tasks, recentOverrides,
  }
}

/**
 * A statement of where an agent stands, with a digest of the cases behind it, for a person to sign. Orlune does not
 * sign it: a certificate means something only when the key is yours.
 */
export async function autonomyStatement(input: { agent: string; tier: Tier; cases: AutonomyCase[]; rule: AutonomyRule; looks?: number; issuedAt: string }) {
  const j = judgeAutonomy(input.cases, input.rule, input.looks, input.tier)
  const body = {
    agent: input.agent,
    tier: input.tier,
    verdict: j.status,
    next: j.status === 'ready' ? nextTier(input.tier) : j.status === 'demote' ? TIERS[Math.max(0, TIERS.findIndex((t) => t.id === input.tier) - 1)]!.id : null,
    rule: input.rule,
    cases: { counted: j.n, agreed: j.agree, overridden: j.override, asked: j.abstained },
    interval: { lower: j.lower, upper: j.upper, confidence: j.confidence, looks: j.looks },
    blockers: j.blockers,
    issuedAt: input.issuedAt,
  }
  const casesDigest = await sha256Hex(canonical(input.cases))
  return { body, casesDigest, digest: await sha256Hex(canonical({ body, casesDigest })) }
}
