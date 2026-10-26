export type Guarantee = {
  id: string
  statement: string
  check: string
  deadlineHours?: number
  remedy: string
}

export type Manifest = {
  schema?: string
  engagement: string
  created?: string
  /** Role to party name, for example { provider: 'acme', client: 'client' }. Both must sign. */
  parties?: Record<string, string>
  guarantees: Guarantee[]
}

export type SignatureFile = {
  schema?: string
  manifestSha256: string
  signatures: Record<string, { signedAt: string; sig: string }>
}

export type LedgerEvent = {
  seq: number
  type: string
  at: string
  by: string
  prev: string
  sig: string
  label?: string
  ref?: number
  result?: string
  guarantee?: string
  [extra: string]: unknown
}

/** Everything needed to verify a record with no network: the files plus each party's public key (PEM, SPKI). */
export type RecordBundle = {
  manifest: Manifest
  signatures: SignatureFile
  ledger: LedgerEvent[]
  publicKeys: Record<string, string>
}

export type GuaranteeStatus = 'honored' | 'pending' | 'breached' | 'remedied'

export type GuaranteeResult = {
  id: string
  status: GuaranteeStatus
  detail: string
  /** True when a guarantee was breached and no remedy event exists. */
  remedyOutstanding: boolean
}

export type VerifiedEvent = {
  seq: number
  type: string
  at: string
  by: string
  label?: string
  result?: string
  ref?: number
  guarantee?: string
  /** First 12 hex characters of this event's hash, which the next event chains to. */
  hash: string
  signatureValid: boolean
  chainValid: boolean
}

export type VerifyResult = {
  ok: boolean
  engagement: string
  manifestSha256: string
  signatures: {
    party: string
    valid: boolean
    signedAt?: string
    /** A short fingerprint of the key that signed, so a reader can tell which key it was. */
    keyId?: string
    /** Whether that key is on the list you passed in `trustedKeys`. Absent when you passed none. */
    trusted?: boolean
  }[]
  /**
   * `trusted`: every signing key is on your list. `valid-unknown-signer`: the signatures check but a key is not on it.
   * `not-checked`: you gave no list, so only validity was checked. Any trusted record is also valid.
   */
  trust?: 'trusted' | 'valid-unknown-signer' | 'not-checked'
  ledger: { events: number; intact: boolean }
  guarantees: GuaranteeResult[]
  events: VerifiedEvent[]
  problems: string[]
  verifiedAt: string
}
