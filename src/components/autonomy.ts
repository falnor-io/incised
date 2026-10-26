// Rules for deciding when an agent has earned more autonomy. The point of each: the verdict comes from counted
// cases and an exact interval, never from a feeling, and a person still makes the promotion.
import { clopperPearson } from '../verify/stats.js'
import { pct } from './util.js'

export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

/** The five tiers from the arXiv agent reliability profile for financial services: what the agent does, and who is the fallback. */
export const TIERS: { id: Tier; name: string; does: string; fallback: string }[] = [
  { id: 'T0', name: 'Suggests', does: 'Reads and suggests. A person does the task.', fallback: 'The person is the operator' },
  { id: 'T1', name: 'Assists', does: 'Helps with one action at a time, each started by a person.', fallback: 'The person, throughout' },
  { id: 'T2', name: 'Approved steps', does: 'Runs a multi-step task. A person approves every material action.', fallback: 'The person, throughout' },
  { id: 'T3', name: 'Handles', does: 'Handles the whole task and asks for help on uncertainty or defined triggers.', fallback: 'A person, after a handoff' },
  { id: 'T4', name: 'Acts in bounds', does: 'Acts inside a fixed envelope with no live approval. Anything outside is blocked.', fallback: 'A tested safe state' },
]

export const nextTier = (t: Tier): Tier | null => {
  const i = TIERS.findIndex((x) => x.id === t)
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1]!.id : null
}

/** What the person did with what the agent proposed. `abstained` means the agent asked instead of proposing. */
export type Outcome = 'agree' | 'override' | 'abstained'
export type AutonomyCase = { id: string; task?: string; outcome: Outcome; at?: string }
/** `rate` of cases agreed, with the interval's lower bound at or over it, across at least `minCases` cases. */
export type AutonomyRule = { rate: number; minCases: number; confidence?: number }

export type TaskRow = { task: string; n: number; agree: number; observed: number; lower: number; upper: number; weak: boolean }
export type Judgement = {
  status: 'collecting' | 'stay' | 'ready'
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
  tasks: TaskRow[]
  recentOverrides: AutonomyCase[]
}

const MIN_TASK_CASES = 5

/**
 * Judges a set of cases against a rule. Abstentions are not counted: the agent asked, so there was nothing to agree
 * with. Looking at the result again and again and promoting the first time it passes makes a false pass more likely,
 * so the allowed error is divided across the looks (a Bonferroni split) and the interval widens with each one.
 */
export function judgeAutonomy(cases: AutonomyCase[], rule: AutonomyRule, looks = 1): Judgement {
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

  let status: Judgement['status']
  let reason: string
  if (n < rule.minCases) {
    status = 'collecting'
    reason = `${n} of ${rule.minCases} cases so far. ${need} more before there is a verdict.`
  } else if (interval.lower >= rule.rate) {
    status = 'ready'
    reason = `The lower bound is ${pct(interval.lower)}, at or over the ${pct(rule.rate, 0)} rule. A person still decides the promotion.`
  } else {
    status = 'stay'
    reason = `The lower bound is ${pct(interval.lower)}, under the ${pct(rule.rate, 0)} rule. More agreement or more cases would move it.`
  }
  return {
    status, n, agree, override: overrides.length, abstained: cases.length - n, observed: n ? agree / n : 0,
    lower: interval.lower, upper: interval.upper, confidence, looks: lookCount, need, reason, tasks, recentOverrides,
  }
}
