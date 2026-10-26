'use client'

import { useId, useMemo, useState } from 'react'
import { judgeEvidence, type AvailableValue, type EvidenceRow } from './evidence.js'
import { cx, formatWhen } from './util.js'
import { after } from './theatre.js'

export type EvidenceTableProps = {
  title: string
  rows: EvidenceRow[]
  /** Your document text by id. A source with a `docId` has its excerpt looked up in it, and one that is not there is flagged. */
  documents?: Record<string, string>
  /** What the source documents contain, so values the agent left out can be named. */
  available?: AvailableValue[]
  className?: string
}

type Filter = 'all' | 'unsourced' | 'conflict' | 'unverified'

/**
 * Each extracted value with the places it was read from. Coverage and conflicts are counted from the sources. There
 * is no confidence score: a value has a source or it does not, and two sources either agree or they do not.
 */
export function EvidenceTable({ title, rows, documents, available, className }: EvidenceTableProps) {
  const { rows: judged, omitted, summary } = useMemo(() => judgeEvidence(rows, { documents, available }), [rows, documents, available])
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Set<string>>(() => new Set(judged.filter((j) => j.status === 'conflict' || j.status === 'unverified').map((j) => j.row.id)))
  const base = useId()
  const shown = judged.filter((j) => filter === 'all' || j.status === filter)
  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allSourced = summary.total > 0 && summary.unsourced === 0 && summary.conflicts === 0 && summary.unverified === 0 && summary.omitted === 0
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={allSourced ? 'good' : summary.conflicts || summary.unverified ? 'bad' : 'warn'}>{summary.text}</span>
      </div>
      <div className="ol-chips" role="group" aria-label="Show">
        {([['all', 'All', summary.total], ['unsourced', 'No source', summary.unsourced], ['conflict', 'Conflict', summary.conflicts], ['unverified', 'Quote not found', summary.unverified]] as const).map(([id, label, n]) => (
          <button key={id} type="button" className="ol-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} {n}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="ol-sub" role="status">{summary.total === 0 ? 'No values yet.' : 'Nothing matches.'}</p>
      ) : (
        <ul className="ol-evlist">
          {shown.map(({ row, status, conflicts, checks }, idx) => {
            const expanded = open.has(row.id)
            const id = `${base}-${row.id}`
            return (
              <li key={row.id} className="ol-evrow ol-in" style={after(idx)} data-status={status}>
                <button type="button" className="ol-evbtn" aria-label={`${row.field}: ${row.value}. ${status === 'unsourced' ? 'No source' : status === 'conflict' ? 'Sources conflict' : status === 'unverified' ? 'A quote is not in its document' : `${row.sources.length} ${row.sources.length === 1 ? 'source' : 'sources'}`}`} aria-expanded={expanded} aria-controls={id} onClick={() => toggle(row.id)}>
                  <span className="ol-evfield">{row.field}</span>
                  <span className="ol-evval">{row.value}</span>
                  <span className="ol-pill" data-tone={status === 'conflict' || status === 'unverified' ? 'bad' : status === 'unsourced' ? 'warn' : 'good'}>
                    {status === 'unsourced' ? 'No source' : status === 'conflict' ? 'Conflict' : status === 'unverified' ? 'Quote not found' : row.sources.length === 1 ? '1 source' : `${row.sources.length} sources`}
                  </span>
                </button>
                {expanded && (
                  <ul id={id} className="ol-evsrcs">
                    {row.sources.length === 0 && <li className="ol-sub">Nothing in the record says where this came from.</li>}
                    {row.sources.map((s) => {
                      const bad = conflicts.includes(s)
                      return (
                        <li key={s.id} className="ol-evsrc">
                          <span><b>{s.label}</b>{s.locator && <span className="ol-sub"> {s.locator}</span>}{s.readAt && <span className="ol-sub"> read {formatWhen(s.readAt)}</span>}</span>
                          {s.read !== undefined && <span className={bad ? 'ol-evread ol-evbad' : 'ol-evread'}>{bad ? `Says ${s.read}` : `Says ${s.read}, matches`}</span>}
                          {s.excerpt && <blockquote className="ol-excerpt">{s.excerpt}</blockquote>}
                          {checks[s.id]?.quote === 'found' && <span className="ol-sub">The quote is in the document.</span>}
                          {checks[s.id]?.quote === 'not-found' && <span className="ol-evread ol-evbad">This quote is not in the document.</span>}
                          {checks[s.id]?.excerptHasRead === false && <span className="ol-evread ol-evbad">The quote does not contain {s.read}.</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {omitted.length > 0 && (
        <div className="ol-gatelist">
          <p className="ol-sub">In the source, not extracted</p>
          <ul>{omitted.map((o) => <li key={o.id}><span>{o.field}: {o.value}</span>{o.locator && <span className="ol-sub">{o.locator}</span>}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
