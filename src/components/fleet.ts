// Rules for reading a fleet of agents at once. The point of each: every agent's row is worked out from its own
// cases, grants and budget by the same functions the single views use, so a row can never say more than its parts.
import { judgeAutonomy, nextTier, type AutonomyCase, type AutonomyRule, type Judgement, type Tier } from './autonomy.js'
import { judgeBudget, type BudgetInput, type BudgetReport } from './budget.js'
import { judgeGrants, type Grant, type GrantSummary } from './permissions.js'

export type FleetAgent = {
  id: string
  name: string
  tier: Tier
  cases: AutonomyCase[]
  rule: AutonomyRule
  looks?: number
  grants?: Grant[]
  budget?: BudgetInput
}
export type AgentFlag = { kind: 'budget' | 'grant' | 'overrides'; text: string; severity: 'warn' | 'bad' }
export type AgentRow = {
  agent: FleetAgent
  autonomy: Judgement
  /** The tier this agent could be considered for, when the gate says eligible. */
  eligibleFor: Tier | null
  grants?: GrantSummary
  budget?: BudgetReport
  flags: AgentFlag[]
}
export type FleetSummary = { agents: number; eligible: number; flagged: number; text: string }

const RECENT_MS = 7 * 24 * 3600 * 1000

/** Flagged agents first, worst flag first, then agents eligible to move up, then the rest by name. */
export function judgeFleet(agents: FleetAgent[], now?: string | Date): { rows: AgentRow[]; summary: FleetSummary } {
  const clock = (now ? new Date(now) : new Date()).getTime()
  const rows = agents.map((agent): AgentRow => {
    const autonomy = judgeAutonomy(agent.cases, agent.rule, agent.looks)
    const grants = agent.grants ? judgeGrants(agent.grants, now).summary : undefined
    const budget = agent.budget ? judgeBudget({ now, ...agent.budget }) : undefined
    const flags: AgentFlag[] = []
    if (budget?.status === 'over') flags.push({ kind: 'budget', text: budget.text, severity: 'bad' })
    else if (budget?.status === 'over-pace') flags.push({ kind: 'budget', text: budget.text, severity: 'bad' })
    else if (budget?.status === 'watch' || budget?.status === 'unreadable') flags.push({ kind: 'budget', text: budget.text, severity: 'warn' })
    if (grants && grants.counts.over) flags.push({ kind: 'grant', text: `${grants.counts.over} grant${grants.counts.over > 1 ? 's' : ''} over the limit.`, severity: 'bad' })
    if (grants && grants.counts.exhausted + grants.counts.expiring) flags.push({ kind: 'grant', text: `${grants.counts.exhausted + grants.counts.expiring} grant${grants.counts.exhausted + grants.counts.expiring > 1 ? 's' : ''} used up or expiring.`, severity: 'warn' })
    const recent = autonomy.recentOverrides.filter((c) => c.at && clock - new Date(c.at).getTime() <= RECENT_MS && new Date(c.at).getTime() <= clock)
    if (agent.tier !== 'T0' && recent.length >= 3) flags.push({ kind: 'overrides', text: `${recent.length} overrides in the last 7 days.`, severity: 'warn' })
    return { agent, autonomy, eligibleFor: autonomy.status === 'ready' ? nextTier(agent.tier) : null, grants, budget, flags }
  })
  const rank = (r: AgentRow) => (r.flags.some((f) => f.severity === 'bad') ? 0 : r.flags.length ? 1 : r.eligibleFor ? 2 : 3)
  rows.sort((a, b) => rank(a) - rank(b) || a.agent.name.localeCompare(b.agent.name))
  const flagged = rows.filter((r) => r.flags.length).length
  const eligible = rows.filter((r) => r.eligibleFor).length
  const parts = [`${rows.length} agent${rows.length === 1 ? '' : 's'}`]
  if (flagged) parts.push(`${flagged} need attention`)
  if (eligible) parts.push(`${eligible} eligible for a higher tier`)
  return { rows, summary: { agents: rows.length, eligible, flagged, text: parts.join(', ') } }
}
