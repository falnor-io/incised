'use client'

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
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <h3 className="ol-title">{title}</h3>
      {list.length === 0 ? (
        <p className="ol-sub">No events yet.</p>
      ) : (
        <div className="ol-scroll">
          <ol className="ol-list ol-chain">
            {list.map((e, i) => {
              const bad = !e.signatureValid
              return (
                <Fragment key={e.seq}>
                  {i > 0 && (
                    <li className="ol-link" data-ok={e.chainValid ? 'true' : 'false'} aria-label={e.chainValid ? 'chain link intact' : 'chain link broken'}>
                      <span aria-hidden="true">{e.chainValid ? null : <Cross />}</span>
                    </li>
                  )}
                  <li className="ol-block" data-bad={bad ? 'true' : 'false'}>
                    <div className="ol-sub">#{e.seq}</div>
                    <strong>{e.type.replace(/_/g, ' ')}</strong>
                    <div className="ol-id ol-sub" title="Hash of this event">{e.hash}</div>
                    <div className="ol-id ol-sub" title="Hash of the event before">← {i === 0 ? 'genesis' : list[i - 1]?.hash}</div>
                    <span className="ol-pill" data-tone={bad ? 'bad' : 'good'}>{bad ? 'Signature invalid' : e.by}</span>
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
