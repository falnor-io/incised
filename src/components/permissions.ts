// Rules for what an agent is allowed to do. The point of each: whether a grant still counts, and how much of it is
// left, comes from the grant, the clock and what has been used, not from the agent.

export type Period = 'day' | 'week' | 'month' | 'total'
export type Grant = {
  id: string
  /** What it allows, for example "payments:release". */
  scope: string
  /** What it applies to, for example a system or an account. */
  resource?: string
  /** A cap on use. `used` is what has been spent against it in the period. */
  limit?: { amount: number; unit: string; period: Period }
  used?: number
  grantedBy: string
  grantedAt: string
  expiresAt?: string
  revokedAt?: string
  /** `delegated` acts for one person and never exceeds what they may do. `autonomous` acts for the organisation under its own role. */
  mode?: 'delegated' | 'autonomous'
  /** For a delegated grant, who it acts for. */
  forUser?: string
  /** The person answerable for this agent. */
  owner?: string
  /** When the scope was last used. A scope nobody uses is access nobody needs. */
  lastUsedAt?: string
  /** The effect cannot be undone. */
  irreversible?: boolean
  /** A person other than the agent approves each use. */
  needsApproval?: boolean
}
export type GrantStatus = 'active' | 'expiring' | 'exhausted' | 'over' | 'expired' | 'revoked'
export type JudgedGrant = {
  grant: Grant
  status: GrantStatus
  remaining?: number
  share?: number
  expiresInMs?: number
  why: string
  /** In force but not used for `dormantDays`, so a candidate to remove. */
  dormant: boolean
  /** For a delegated grant when the user's own permissions are known: `none` when the person it acts for could not do this either. */
  effective?: 'full' | 'none'
  /** What is wrong with how the grant is set up, apart from its status. */
  problems: string[]
}
export type GrantSummary = { counts: Record<GrantStatus, number>; attention: number; dormant: number; blocked: number; text: string }
export type GrantOptions = {
  /** What each person may do, by user. With it, a delegated grant is checked against the person it acts for. */
  userScopes?: Record<string, string[]>
  /** Days without use before a grant in force counts as dormant. Defaults to 30. */
  dormantDays?: number
  /** Flag a grant with no named owner. */
  requireOwner?: boolean
}

/** A scope is covered by an exact match, a `prefix:*` entry or `*`. */
export function covers(allowed: string[], scope: string): boolean {
  return allowed.some((a) => a === '*' || a === scope || (a.endsWith(':*') && scope.startsWith(a.slice(0, -1))))
}

const EXPIRING_MS = 24 * 3600 * 1000
const ORDER: GrantStatus[] = ['over', 'exhausted', 'expiring', 'active', 'expired', 'revoked']

export function amount(n: number, unit: string): string {
  const v = n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const sym = ({ USD: '$', GBP: '£', EUR: '€' } as Record<string, string>)[unit]
  return sym ? `${sym}${v}` : `${v} ${unit}`
}

function ago(ms: number): string {
  const h = Math.round(Math.abs(ms) / 3600000)
  return h < 48 ? `${Math.max(1, h)} h` : `${Math.round(h / 24)} days`
}

export function judgeGrants(grants: Grant[], now?: string | Date, options: GrantOptions = {}): { rows: JudgedGrant[]; summary: GrantSummary } {
  const clock = (now ? new Date(now) : new Date()).getTime()
  const rows = grants.map((g): JudgedGrant => {
    const used = g.used ?? 0
    const share = g.limit ? (g.limit.amount > 0 ? used / g.limit.amount : used > 0 ? 2 : 1) : undefined
    const remaining = g.limit ? g.limit.amount - used : undefined
    const expiresInMs = g.expiresAt ? new Date(g.expiresAt).getTime() - clock : undefined
    const revokedMs = g.revokedAt ? new Date(g.revokedAt).getTime() : undefined
    let status: GrantStatus
    let why: string
    // A date that cannot be read fails closed: the grant is not counted as in force.
    if (g.revokedAt && Number.isNaN(revokedMs)) {
      status = 'revoked'
      why = 'Its revocation date could not be read, so it is not counted as in force.'
    } else if (g.expiresAt && Number.isNaN(expiresInMs)) {
      status = 'expired'
      why = 'Its end date could not be read, so it is not counted as in force.'
    } else if (revokedMs !== undefined && revokedMs <= clock) {
      status = 'revoked'
      why = `Revoked ${ago(clock - revokedMs)} ago.`
    } else if (expiresInMs !== undefined && expiresInMs <= 0) {
      status = 'expired'
      why = `Expired ${ago(expiresInMs)} ago.`
    } else if (g.limit && used > g.limit.amount) {
      status = 'over'
      why = `Over the limit by ${amount(used - g.limit.amount, g.limit.unit)}.`
    } else if (g.limit && used === g.limit.amount) {
      status = 'exhausted'
      why = 'The limit is used up.'
    } else if (expiresInMs !== undefined && expiresInMs < EXPIRING_MS) {
      status = 'expiring'
      why = `Expires in ${ago(expiresInMs)}.`
    } else {
      status = 'active'
      why = g.limit ? `${amount(remaining!, g.limit.unit)} left${g.limit.period === 'total' ? '' : ` this ${g.limit.period}`}.` : 'No cap.'
    }
    const live = status === 'active' || status === 'expiring' || status === 'exhausted' || status === 'over'
    const dormantMs = (options.dormantDays ?? 30) * 24 * 3600 * 1000
    const sinceUse = g.lastUsedAt ? clock - new Date(g.lastUsedAt).getTime() : g.grantedAt ? clock - new Date(g.grantedAt).getTime() : NaN
    const dormant = live && Number.isFinite(sinceUse) && sinceUse > dormantMs
    const problems: string[] = []
    let effective: JudgedGrant['effective']
    if (g.mode === 'delegated') {
      if (!g.forUser) problems.push('It acts for a user but does not say which.')
      else if (options.userScopes) {
        effective = covers(options.userScopes[g.forUser] ?? [], g.scope) ? 'full' : 'none'
        if (effective === 'none') problems.push(`${g.forUser} cannot do this, so an agent acting for them cannot either.`)
      }
    }
    if (options.requireOwner && !g.owner) problems.push('No named owner.')
    if (g.irreversible && !g.needsApproval) problems.push('It cannot be undone and nobody approves each use.')
    return { grant: g, status, remaining, share, expiresInMs: Number.isFinite(expiresInMs) ? expiresInMs : undefined, why, dormant, effective, problems }
  }).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const counts = Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<GrantStatus, number>
  const blocked = rows.filter((r) => r.effective === 'none').length
  const dormant = rows.filter((r) => r.dormant).length
  const attention = counts.over + counts.exhausted + counts.expiring + blocked
  const live = counts.active + counts.expiring + counts.exhausted + counts.over
  const parts = [`${live} in force`]
  if (counts.over) parts.push(`${counts.over} over the limit`)
  if (counts.exhausted) parts.push(`${counts.exhausted} used up`)
  if (counts.expiring) parts.push(`${counts.expiring} expiring soon`)
  if (counts.expired) parts.push(`${counts.expired} expired`)
  if (counts.revoked) parts.push(`${counts.revoked} revoked`)
  if (blocked) parts.push(`${blocked} more than the user may do`)
  if (dormant) parts.push(`${dormant} not used lately`)
  return { rows, summary: { counts, attention, dormant, blocked, text: parts.join(', ') } }
}
