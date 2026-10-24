import { canonical, importPublicKey, sha256Hex, verifyEd25519 } from './canonical.js'
import type { GuaranteeResult, LedgerEvent, RecordBundle, VerifiedEvent, VerifyResult } from './types.js'

const hours = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 36e5

export type VerifyOptions = {
  /** The moment to judge open deadlines against. Defaults to now. Pass it to make a result reproducible. */
  now?: Date
}

/**
 * Verifies a record offline: manifest hash and both signatures, the hash-chained signed ledger, and the
 * deadline rules. A breach counts as honored only when a matching remedy event exists. The result is the
 * only thing the record components trust, so it must come from here and never from model output.
 */
export async function verifyRecord(record: RecordBundle, options: VerifyOptions = {}): Promise<VerifyResult> {
  const now = (options.now ?? new Date()).toISOString()
  const problems: string[] = []
  const { manifest, signatures, ledger, publicKeys } = record

  const manifestSha256 = await sha256Hex(canonical(manifest))
  if (signatures.manifestSha256 !== manifestSha256) problems.push('Manifest has been modified since signing (hash mismatch).')

  const keys = new Map<string, CryptoKey>()
  for (const [party, pem] of Object.entries(publicKeys)) {
    try {
      keys.set(party, await importPublicKey(pem))
    } catch {
      problems.push(`Public key for ${party} could not be read.`)
    }
  }

  const required = Object.values(manifest.parties ?? {}).length ? Object.values(manifest.parties ?? {}) : Object.keys(publicKeys)
  const sigRows: VerifyResult['signatures'] = []
  for (const party of required) {
    const entry = signatures.signatures[party]
    const key = keys.get(party)
    if (!entry) {
      problems.push(`Manifest is not signed by ${party}.`)
      sigRows.push({ party, valid: false })
    } else if (!key || !(await verifyEd25519(key, signatures.manifestSha256, entry.sig))) {
      problems.push(`${party} signature on the manifest is invalid.`)
      sigRows.push({ party, valid: false, signedAt: entry.signedAt })
    } else {
      sigRows.push({ party, valid: true, signedAt: entry.signedAt })
    }
  }

  const events: VerifiedEvent[] = []
  let prev = 'genesis'
  let intact = true
  for (const entry of ledger) {
    const { sig, ...body } = entry
    const chainValid = body.prev === prev
    const key = keys.get(body.by)
    const signatureValid = key ? await verifyEd25519(key, canonical(body), sig) : false
    if (!chainValid) {
      intact = false
      problems.push(`Ledger broken at event #${body.seq}: chain hash mismatch (tampering or deletion).`)
    }
    if (!signatureValid) {
      intact = false
      problems.push(`Event #${body.seq} (${body.type}) signature is invalid for ${body.by}.`)
    }
    const hash = await sha256Hex(canonical(entry))
    events.push({
      seq: body.seq,
      type: body.type,
      at: body.at,
      by: body.by,
      label: body.label,
      result: body.result,
      ref: body.ref,
      guarantee: body.guarantee,
      hash: hash.slice(0, 12),
      signatureValid,
      chainValid,
    })
    prev = hash
  }

  const guarantees = judgeGuarantees(manifest.guarantees.map((g) => g.id), manifest, ledger, now)
  const unremedied = guarantees.some((g) => g.status === 'breached' && g.remedyOutstanding)

  return {
    ok: problems.length === 0 && !unremedied,
    engagement: manifest.engagement,
    manifestSha256,
    signatures: sigRows,
    ledger: { events: ledger.length, intact },
    guarantees,
    events,
    problems,
    verifiedAt: now,
  }
}

function judgeGuarantees(ids: string[], manifest: RecordBundle['manifest'], ledger: LedgerEvent[], now: string): GuaranteeResult[] {
  const remedies = ledger.filter((e) => e.type === 'remedy')
  const remedied = (id: string, ref?: number) => remedies.some((r) => r.guarantee === id && (ref === undefined || r.ref === ref))
  const deadline = (id: string, fallback: number) => manifest.guarantees.find((g) => g.id === id)?.deadlineHours ?? fallback
  const out: GuaranteeResult[] = []
  const push = (id: string, status: 'honored' | 'pending' | 'breached', detail: string, ref?: number) => {
    const fixed = status === 'breached' && remedied(id, ref)
    out.push({ id, status: fixed ? 'remedied' : status, detail, remedyOutstanding: status === 'breached' && !fixed })
  }

  for (const id of ids) {
    if (id === 'G1-CRITERIA') {
      const criteria = ledger.find((e) => e.type === 'criteria_signed')
      const launch = ledger.find((e) => e.type === 'launch')
      if (launch && !criteria) push(id, 'breached', 'launch without signed criteria')
      else if (launch && criteria && hours(criteria.at, launch.at) < 0) push(id, 'breached', 'criteria signed after launch')
      else push(id, launch ? 'honored' : 'pending', launch ? 'criteria signed before launch' : 'no launch yet')
    } else if (id === 'G2-RETEST-48H') {
      const limit = deadline(id, 48)
      for (const rel of ledger.filter((e) => e.type === 'model_release')) {
        const retest = ledger.find((e) => e.type === 'retest' && e.ref === rel.seq)
        if (!retest) {
          const overdue = hours(rel.at, now) > limit
          push(id, overdue ? 'breached' : 'pending', `release #${rel.seq} ${overdue ? 'has no re-test' : 'awaiting re-test'}`, rel.seq)
        } else {
          const h = hours(rel.at, retest.at)
          push(id, h <= limit ? 'honored' : 'breached', `release #${rel.seq} re-tested in ${h.toFixed(1)}h, ${retest.result ?? 'no result'}`, rel.seq)
        }
      }
    } else if (id === 'G3-ROOTCAUSE-24H') {
      const limit = deadline(id, 24)
      for (const inc of ledger.filter((e) => e.type === 'incident')) {
        const rc = ledger.find((e) => e.type === 'root_cause' && e.ref === inc.seq)
        if (!rc) {
          const overdue = hours(inc.at, now) > limit
          push(id, overdue ? 'breached' : 'pending', `incident #${inc.seq} ${overdue ? 'has no root cause' : 'awaiting root cause'}`, inc.seq)
        } else {
          const h = hours(inc.at, rc.at)
          push(id, h <= limit ? 'honored' : 'breached', `incident #${inc.seq} root cause in ${h.toFixed(1)}h`, inc.seq)
        }
      }
    } else if (id === 'G4-RECORD-OWNED') {
      push(id, 'honored', 'this result was computed offline from the record and public keys alone')
    }
  }
  return out
}
