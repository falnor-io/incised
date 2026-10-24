import type { VerifyResult } from '../verify/types.js'
import { useRecordResult } from './RecordContext.js'
import { Check, Cross } from './icons.js'
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
      <section className={cx('kl', className)} aria-label="Record verification">
        <div className="kl-verdict" data-ok="unknown">Not verified</div>
        <p className="kl-sub">No verifier result has been provided for this record.</p>
      </section>
    )
  }
  const honored = r.guarantees.filter((g) => g.status === 'honored' || g.status === 'remedied').length
  return (
    <section className={cx('kl', className)} aria-label="Record verification">
      <div className="kl-verdict" data-ok={r.ok ? 'true' : 'false'} role="status">
        {r.ok ? <Check /> : <Cross />}
        {r.ok ? 'Verified' : 'Verification failed'}
      </div>
      <p className="kl-sub" style={{ margin: '4px 0 0' }}>{r.engagement}{r.ok ? ' · every guarantee honored or remedied' : ''}</p>
      <dl className="kl-dl">
        <dt>Manifest</dt>
        <dd className="kl-id">{r.manifestSha256.slice(0, 12)}</dd>
        {r.signatures.map((s) => (
          <Row key={s.party} label={`Signed by ${s.party}`}>
            <span className="kl-pill" data-tone={s.valid ? 'good' : 'bad'}>{s.valid ? 'valid' : 'invalid'}</span>
            {s.signedAt && <span className="kl-sub"> {formatWhen(s.signedAt)}</span>}
          </Row>
        ))}
        <dt>Ledger</dt>
        <dd>
          {r.ledger.events} events,{' '}
          <span className="kl-pill" data-tone={r.ledger.intact ? 'good' : 'bad'}>{r.ledger.intact ? 'chain intact' : 'chain broken'}</span>
        </dd>
        <dt>Guarantees</dt>
        <dd>{honored} of {r.guarantees.length} checks honored or remedied</dd>
      </dl>
      {r.problems.length > 0 && (
        <ul className="kl-problems">
          {r.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="kl-sub" style={{ margin: '10px 0 0' }}>Checked on this device</p>
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
