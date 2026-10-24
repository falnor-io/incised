import { Fragment } from 'react'
import type { VerifiedEvent } from '../verify/types.js'
import { useRecordResult } from './RecordContext.js'
import { Cross } from './icons.js'
import { cx } from './util.js'

/** The ledger as linked blocks. A broken link or a bad signature shows where the chain stops being trustworthy. */
export function ChainGraph({ events, title = 'Hash chain', className }: { events?: VerifiedEvent[]; title?: string; className?: string }) {
  const fromContext = useRecordResult()
  const list = events ?? fromContext?.events ?? []
  return (
    <section className={cx('kl', className)} aria-label={title}>
      <h3 className="kl-title">{title}</h3>
      {list.length === 0 ? (
        <p className="kl-sub">No events yet.</p>
      ) : (
        <div className="kl-scroll">
          <ol className="kl-list kl-chain">
            {list.map((e, i) => {
              const bad = !e.signatureValid
              return (
                <Fragment key={e.seq}>
                  {i > 0 && (
                    <li className="kl-link" data-ok={e.chainValid ? 'true' : 'false'} aria-label={e.chainValid ? 'chain link intact' : 'chain link broken'}>
                      <span aria-hidden="true">{e.chainValid ? null : <Cross />}</span>
                    </li>
                  )}
                  <li className="kl-block" data-bad={bad ? 'true' : 'false'}>
                    <div className="kl-sub">#{e.seq}</div>
                    <strong>{e.type.replace(/_/g, ' ')}</strong>
                    <div className="kl-id kl-sub" title="Hash of this event">{e.hash}</div>
                    <div className="kl-id kl-sub" title="Hash of the event before">← {i === 0 ? 'genesis' : list[i - 1]?.hash}</div>
                    <span className="kl-pill" data-tone={bad ? 'bad' : 'good'}>{bad ? 'Signature invalid' : e.by}</span>
                  </li>
                </Fragment>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
