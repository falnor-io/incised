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
}
export type GrantStatus = 'active' | 'expiring' | 'exhausted' | 'over' | 'expired' | 'revoked'
export type JudgedGrant = { grant: Grant; status: GrantStatus; remaining?: number; share?: number; expiresInMs?: number; why: string }
export type GrantSummary = { counts: Record<GrantStatus, number>; attention: number; text: string }

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

export function judgeGrants(grants: Grant[], now?: string | Date): { rows: JudgedGrant[]; summary: GrantSummary } {
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
    return { grant: g, status, remaining, share, expiresInMs: Number.isFinite(expiresInMs) ? expiresInMs : undefined, why }
  }).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const counts = Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<GrantStatus, number>
  const attention = counts.over + counts.exhausted + counts.expiring
  const live = counts.active + counts.expiring + counts.exhausted + counts.over
  const parts = [`${live} in force`]
  if (counts.over) parts.push(`${counts.over} over the limit`)
  if (counts.exhausted) parts.push(`${counts.exhausted} used up`)
  if (counts.expiring) parts.push(`${counts.expiring} expiring soon`)
  if (counts.expired) parts.push(`${counts.expired} expired`)
  if (counts.revoked) parts.push(`${counts.revoked} revoked`)
  return { rows, summary: { counts, attention, text: parts.join(', ') } }
}
