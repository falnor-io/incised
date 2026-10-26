'use client'

import type { VerifiedEvent } from '../verify/types.js'
import { useRecordResult } from './RecordContext.js'
import { cx, formatWhen } from './util.js'

const LABELS: Record<string, string> = {
  criteria_signed: 'Criteria signed',
  launch: 'Launch',
  model_release: 'Model release',
  retest: 'Re-test',
  incident: 'Incident',
  root_cause: 'Root cause',
  remedy: 'Remedy delivered',
}

function flagFor(e: VerifiedEvent): 'bad' | 'warn' | 'good' | undefined {
  if (!e.signatureValid || !e.chainValid) return 'bad'
  if (e.type === 'incident') return 'warn'
  if (e.type === 'retest') return e.result === 'fail' ? 'bad' : 'good'
  if (e.type === 'remedy') return 'good'
  return undefined
}

/** The hash-chained ledger. Events come from the verifier, so a broken link or bad signature shows in red. */
export function LedgerTimeline({ events, title = 'Record ledger', className }: { events?: VerifiedEvent[]; title?: string; className?: string }) {
  const fromContext = useRecordResult()
  const list = events ?? fromContext?.events ?? []
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      {list.length === 0 ? (
        <p className="ol-sub">No events yet.</p>
      ) : (
        <ol className="ol-list">
          {list.map((e) => (
            <li className="ol-event" key={e.seq} data-flag={flagFor(e)}>
              <span className="ol-sub">{e.seq}</span>
              <div>
                <span className="ol-evtype">{LABELS[e.type] ?? e.type}</span>
                {e.label && <span> · {e.label}</span>}
                {e.result && <span className="ol-pill" data-tone={e.result === 'pass' ? 'good' : 'bad'} style={{ marginLeft: 6 }}>{e.result}</span>}
                <div className="ol-sub">
                  {e.by} · {formatWhen(e.at)}
                  {e.ref !== undefined && ` · answers #${e.ref}`}
                </div>
                {(!e.signatureValid || !e.chainValid) && (
                  <div style={{ color: 'var(--ol-bad)' }}>
                    {!e.chainValid && 'Chain link broken. '}
                    {!e.signatureValid && 'Signature invalid.'}
                  </div>
                )}
              </div>
              <span className="ol-id ol-sub" title="Hash of this event, which the next event chains to">{e.hash}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
