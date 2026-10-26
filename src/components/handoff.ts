// Rules for the packet an agent hands a person when it stops. The point of each: a handoff is complete only when the
// person could act without going back to ask the agent anything, and that is checked, not asserted.

export type Handoff = {
  /** What the agent was doing. */
  summary: string
  /** What it already tried, so the person does not repeat it. */
  attempted: string[]
  /** The reason it stopped. */
  stoppedBecause: string
  /** What it suggests, and why. A suggestion, not a decision. */
  recommended?: { action: string; why: string }
  /** The role that has to act. */
  needsFrom: string
  /** When a person has to act by. */
  deadline?: string
  /** What the person can check. */
  evidence: { label: string; ref?: string }[]
  /** Why it handed off, so the rule that fired can be seen. Early triggers beat giving up after repeated failure. */
  trigger?: { kind: 'asked' | 'high-stakes' | 'repeated-failure' | 'sentiment' | 'limit' | 'other'; detail?: string }
  /** `warm`: the receiving person was briefed before taking over. `cold`: they start from this packet alone. */
  transfer?: 'warm' | 'cold'
  /** Who it went to, and whether that is a person the sender checked is the right one. */
  recipient?: { name: string; verified: boolean }
}

/** `notes` are worth fixing but do not make the packet incomplete. */
export type HandoffCheck = { missing: string[]; notes: string[]; complete: boolean; leftMs?: number; late: boolean; text: string }

const filled = (s?: string) => !!s && s.trim().length > 0

export function checkHandoff(h: Partial<Handoff>, now?: string | Date): HandoffCheck {
  const missing: string[] = []
  if (!filled(h.summary)) missing.push('what it was doing')
  if (!h.attempted?.some(filled)) missing.push('what it tried')
  if (!filled(h.stoppedBecause)) missing.push('why it stopped')
  if (!h.recommended || !filled(h.recommended.action) || !filled(h.recommended.why)) missing.push('a recommendation')
  if (!filled(h.needsFrom)) missing.push('who has to act')
  if (!filled(h.deadline)) missing.push('a deadline')
  if (!h.evidence?.length) missing.push('evidence to check')
  const clock = (now ? new Date(now) : new Date()).getTime()
  const leftMs = h.deadline && !Number.isNaN(new Date(h.deadline).getTime()) ? new Date(h.deadline).getTime() - clock : undefined
  const notes: string[] = []
  const sentences = (h.summary ?? '').split(/[.!?]+\s/).filter((x) => x.trim()).length
  if (filled(h.summary) && (sentences > 3 || h.summary!.length > 400)) notes.push('The summary is long. Three lines get read, a transcript does not.')
  if (!h.trigger) notes.push('It does not say what made the agent hand off.')
  if (h.recipient && !h.recipient.verified) notes.push(`${h.recipient.name} has not been checked as the right person to receive this.`)
  if (h.transfer === 'cold') notes.push('A cold handoff: the person starts from this packet alone and nobody briefed them.')
  const complete = missing.length === 0 && !(h.recipient && !h.recipient.verified)
  return {
    missing, notes, complete, leftMs, late: leftMs !== undefined && leftMs < 0,
    text: complete ? 'Complete: a person can act on this without asking the agent anything.' : missing.length ? `Incomplete: missing ${missing.join(', ')}. A person would have to ask the agent.` : `Incomplete: ${h.recipient?.name ?? 'the recipient'} has not been checked as the right person.`,
  }
}
