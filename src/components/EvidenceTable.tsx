'use client'

import { useId, useMemo, useState } from 'react'
import { judgeEvidence, type EvidenceRow } from './evidence.js'
import { cx, formatWhen } from './util.js'

export type EvidenceTableProps = {
  title: string
  rows: EvidenceRow[]
  className?: string
}

type Filter = 'all' | 'unsourced' | 'conflict'

/**
 * Each extracted value with the places it was read from. Coverage and conflicts are counted from the sources. There
 * is no confidence score: a value has a source or it does not, and two sources either agree or they do not.
 */
export function EvidenceTable({ title, rows, className }: EvidenceTableProps) {
  const { rows: judged, summary } = useMemo(() => judgeEvidence(rows), [rows])
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Set<string>>(() => new Set(judged.filter((j) => j.status === 'conflict').map((j) => j.row.id)))
  const base = useId()
  const shown = judged.filter((j) => filter === 'all' || j.status === filter)
  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allSourced = summary.total > 0 && summary.unsourced === 0 && summary.conflicts === 0
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={allSourced ? 'good' : summary.conflicts ? 'bad' : 'warn'}>{summary.text}</span>
      </div>
      <div className="ol-chips" role="group" aria-label="Show">
        {([['all', 'All', summary.total], ['unsourced', 'No source', summary.unsourced], ['conflict', 'Conflict', summary.conflicts]] as const).map(([id, label, n]) => (
          <button key={id} type="button" className="ol-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} {n}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="ol-sub" role="status">{summary.total === 0 ? 'No values yet.' : 'Nothing matches.'}</p>
      ) : (
        <ul className="ol-evlist">
          {shown.map(({ row, status, conflicts }) => {
            const expanded = open.has(row.id)
            const id = `${base}-${row.id}`
            return (
              <li key={row.id} className="ol-evrow" data-status={status}>
                <button type="button" className="ol-evbtn" aria-label={`${row.field}: ${row.value}. ${status === 'unsourced' ? 'No source' : status === 'conflict' ? 'Sources conflict' : `${row.sources.length} ${row.sources.length === 1 ? 'source' : 'sources'}`}`} aria-expanded={expanded} aria-controls={id} onClick={() => toggle(row.id)}>
                  <span className="ol-evfield">{row.field}</span>
                  <span className="ol-evval">{row.value}</span>
                  <span className="ol-pill" data-tone={status === 'conflict' ? 'bad' : status === 'unsourced' ? 'warn' : 'good'}>
                    {status === 'unsourced' ? 'No source' : status === 'conflict' ? 'Conflict' : row.sources.length === 1 ? '1 source' : `${row.sources.length} sources`}
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
    </section>
  )
}
