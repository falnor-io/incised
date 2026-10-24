// Builds a signed sample record with node:crypto, in the same format the verifier reads.
// Run: npm run sample  ->  demo/sample-record.json (throwaway keys, safe to publish).
import crypto from 'node:crypto'
import fs from 'node:fs'

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex')

const parties = ['meridian-ai', 'northwind']
const keys = Object.fromEntries(
  parties.map((p) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    return [p, { priv: privateKey, pub: publicKey.export({ type: 'spki', format: 'pem' }) }]
  }),
)
const sign = (party, text) => crypto.sign(null, Buffer.from(text), keys[party].priv).toString('base64')

const manifest = {
  schema: 'klyra.guarantees.v1',
  engagement: 'Northwind: invoice exceptions agent',
  created: '2026-06-01T09:00:00Z',
  parties: { provider: 'meridian-ai', client: 'northwind' },
  guarantees: [
    { id: 'G1-CRITERIA', statement: 'Success criteria signed by both parties before launch.', check: 'A criteria_signed event exists before any launch event.', remedy: 'Launch does not proceed; no milestone invoice issued.' },
    { id: 'G2-RETEST-48H', statement: 'Re-test against the agreed case set within 48 hours of any major model release, written pass/fail.', check: 'Every model_release event is followed by a retest event within 48h.', deadlineHours: 48, remedy: 'Operate month credited in full for each missed window.' },
    { id: 'G3-ROOTCAUSE-24H', statement: 'Written root cause within 24 hours of any production incident.', check: 'Every incident event is followed by a root_cause event within 24h.', deadlineHours: 24, remedy: 'Operate month credited in full for each missed window.' },
    { id: 'G4-RECORD-OWNED', statement: 'The record lives in client storage and verifies without the provider.', check: 'This record verifies offline using public keys alone.', remedy: 'Migration pack delivered within 15 business days.' },
  ],
}
const digest = sha256(canonical(manifest))
const signatures = {
  schema: 'klyra.signatures.v1',
  manifestSha256: digest,
  signatures: Object.fromEntries(parties.map((p, i) => [p, { signedAt: `2026-06-01T1${i}:00:00Z`, sig: sign(p, digest) }])),
}

const ledger = []
function add(by, type, at, fields = {}) {
  const prev = ledger.length ? sha256(canonical(ledger[ledger.length - 1])) : 'genesis'
  const body = { seq: ledger.length + 1, type, at, by, prev, ...fields }
  ledger.push({ ...body, sig: sign(by, canonical(body)) })
}
add('northwind', 'criteria_signed', '2026-06-01T10:00:00Z')
add('meridian-ai', 'launch', '2026-06-02T09:00:00Z')
add('meridian-ai', 'model_release', '2026-06-03T00:00:00Z', { label: 'Frontier model X' })
add('meridian-ai', 'retest', '2026-06-04T06:00:00Z', { ref: 3, result: 'pass' })
add('northwind', 'incident', '2026-06-05T08:00:00Z', { label: 'duplicate payment hold' })
add('meridian-ai', 'root_cause', '2026-06-06T20:00:00Z', { ref: 5 })
add('meridian-ai', 'remedy', '2026-06-06T21:00:00Z', { guarantee: 'G3-ROOTCAUSE-24H', ref: 5, label: 'Operate month credited' })

const record = { manifest, signatures, ledger, publicKeys: Object.fromEntries(parties.map((p) => [p, keys[p].pub])) }
fs.mkdirSync(new URL('../demo', import.meta.url), { recursive: true })
fs.writeFileSync(new URL('../demo/sample-record.json', import.meta.url), JSON.stringify(record, null, 2) + '\n')
console.log(`wrote demo/sample-record.json (${ledger.length} events, manifest ${digest.slice(0, 12)}…)`)
