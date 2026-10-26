// Rules for reading one verified record as a whole. The point of each: the page says "verified" only when the
// verifier's own details agree with its verdict, and the export is the verifier's output, never a fresh claim.
import type { GuaranteeResult, GuaranteeStatus, Manifest, VerifyResult } from '../verify/types.js'

export type Trust = 'verified' | 'failed' | 'inconsistent'
export type RecordSummary = {
  trust: Trust
  /** One plain sentence for the verdict. */
  text: string
  guarantees: Record<GuaranteeStatus, number>
  /** Guarantees breached with no remedy event. */
  outstanding: string[]
  /** Sequence numbers of ledger events whose signature or chain link did not check. */
  brokenEvents: number[]
  /** Parties whose signature on the manifest did not check. */
  badSignatures: string[]
}

const EMPTY: Record<GuaranteeStatus, number> = { honored: 0, pending: 0, breached: 0, remedied: 0 }

/**
 * `result.ok` is the verifier's verdict. This also reads the details beside it, so a result that says ok while a
 * signature or an event is bad is shown as inconsistent, not as verified.
 */
export function summarizeRecord(result: VerifyResult): RecordSummary {
  const guarantees = { ...EMPTY }
  for (const g of result.guarantees) guarantees[g.status] += 1
  const outstanding = result.guarantees.filter((g) => g.remedyOutstanding).map((g) => g.id)
  const brokenEvents = result.events.filter((e) => !e.signatureValid || !e.chainValid).map((e) => e.seq)
  const badSignatures = result.signatures.filter((s) => !s.valid).map((s) => s.party)
  const detailsClean = result.ledger.intact && brokenEvents.length === 0 && badSignatures.length === 0 && outstanding.length === 0 && result.problems.length === 0
  let trust: Trust
  let text: string
  if (result.ok && detailsClean) {
    trust = 'verified'
    text = `Verified. ${result.ledger.events} signed events, every signature valid, ${guarantees.honored + guarantees.remedied} of ${result.guarantees.length} guarantees honored or remedied.`
  } else if (result.ok) {
    trust = 'inconsistent'
    text = 'The verifier said verified, but its own details do not agree. Do not rely on this record until it is run again.'
  } else {
    trust = 'failed'
    const why: string[] = []
    if (badSignatures.length) why.push(`${badSignatures.length === 1 ? 'a signature' : `${badSignatures.length} signatures`} did not match (${badSignatures.join(', ')})`)
    if (brokenEvents.length) why.push(`${brokenEvents.length} ledger event${brokenEvents.length === 1 ? '' : 's'} changed or out of order (#${brokenEvents.join(', #')})`)
    if (!result.ledger.intact && brokenEvents.length === 0) why.push('the ledger chain is broken')
    if (outstanding.length) why.push(`${outstanding.length} breach${outstanding.length === 1 ? '' : 'es'} with no remedy (${outstanding.join(', ')})`)
    text = `Verification failed${why.length ? `: ${why.join('; ')}` : ''}.`
  }
  return { trust, text, guarantees, outstanding, brokenEvents, badSignatures }
}

export type GuaranteeLine = { id: string; statement: string; check: string; deadlineHours?: number; remedy: string; status: GuaranteeStatus; detail: string }

/** Joins what was promised (the manifest) to what the verifier found. A promise with no result is shown as pending. */
export function joinGuarantees(manifest: Manifest | null | undefined, results: GuaranteeResult[]): GuaranteeLine[] {
  const byId = new Map(results.map((g) => [g.id, g]))
  const lines = (manifest?.guarantees ?? []).map((g): GuaranteeLine => {
    const r = byId.get(g.id)
    return { ...g, status: r?.status ?? 'pending', detail: r?.detail ?? 'The verifier returned nothing for this guarantee.' }
  })
  const listed = new Set(lines.map((l) => l.id))
  const unlisted = results.filter((r) => !listed.has(r.id)).map((r): GuaranteeLine => ({ id: r.id, statement: 'Not in the manifest shown.', check: '', remedy: '', status: r.status, detail: r.detail }))
  return [...lines, ...unlisted]
}

/** The verifier's output and the manifest, as text to save. It carries no new signature and says so. */
export function recordExport(result: VerifyResult, manifest?: Manifest | null): string {
  return JSON.stringify(
    {
      note: 'This is the output of the verifier for this record. Run the verifier again on the original files to check it.',
      engagement: result.engagement,
      ok: result.ok,
      verifiedAt: result.verifiedAt,
      manifestSha256: result.manifestSha256,
      signatures: result.signatures,
      ledger: result.ledger,
      guarantees: result.guarantees,
      events: result.events,
      problems: result.problems,
      ...(manifest ? { manifest } : {}),
    },
    null,
    2,
  )
}
