import type { VerifyResult } from '../verify/types.js'
import { useRecordResult } from './RecordContext.js'
import { cx, formatWhen } from './util.js'

/**
 * Shows what the verifier found. It renders only a VerifyResult from verifyRecord (as a prop or from
 * RecordProvider). With no result it says "Not verified" and never a pass.
 */
export function VerifyStatus({ result, className }: { result?: VerifyResult | null; className?: string }) {
  const fromContext = useRecordResult()
  const r = result ?? fromContext
  if (!r) {
    return (
      <section className={cx('ic', className)} aria-label="Record verification">
        <div className="ic-verdict" data-ok="unknown">Not verified</div>
        <p className="ic-sub">No verifier result has been provided for this record.</p>
      </section>
    )
  }
  const honored = r.guarantees.filter((g) => g.status === 'honored' || g.status === 'remedied').length
  return (
    <section className={cx('ic', className)} aria-label="Record verification">
      <div className="ic-verdict" data-ok={r.ok ? 'true' : 'false'} role="status">
        <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
        {r.ok ? 'Verified: every guarantee honored or remedied' : 'Verification failed'}
      </div>
      <p className="ic-sub" style={{ margin: '4px 0 0' }}>{r.engagement}</p>
      <dl className="ic-dl">
        <dt>Manifest</dt>
        <dd className="ic-mono">{r.manifestSha256.slice(0, 16)}…</dd>
        {r.signatures.map((s) => (
          <Row key={s.party} label={`Signed by ${s.party}`}>
            <span className="ic-pill" data-tone={s.valid ? 'good' : 'bad'}>{s.valid ? 'valid' : 'invalid'}</span>
            {s.signedAt && <span className="ic-sub"> {formatWhen(s.signedAt)}</span>}
          </Row>
        ))}
        <dt>Ledger</dt>
        <dd>
          {r.ledger.events} events,{' '}
          <span className="ic-pill" data-tone={r.ledger.intact ? 'good' : 'bad'}>{r.ledger.intact ? 'chain intact' : 'chain broken'}</span>
        </dd>
        <dt>Guarantees</dt>
        <dd>{honored} of {r.guarantees.length} checks honored or remedied</dd>
      </dl>
      {r.problems.length > 0 && (
        <ul className="ic-problems">
          {r.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="ic-sub" style={{ marginBottom: 0 }}>Computed on this device from the record and public keys. No server was asked.</p>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}
