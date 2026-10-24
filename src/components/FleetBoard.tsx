import { useMemo, useState } from 'react'
import type { FleetBoardProps, FleetRow } from '../schemas.js'
import { cx, formatHours } from './util.js'

type Status = FleetRow['status']
type SortKey = 'name' | 'status' | 'due'
const RANK: Record<Status, number> = { breached: 0, watch: 1, ok: 2 }

/** Hours left on the tightest open clock, or null with no clocks or no `now`. Negative means overdue. */
export function soonestDue(row: FleetRow, now?: string | Date): number | null {
  if (!now || row.clocks.length === 0) return null
  const t = new Date(now).getTime()
  const left = row.clocks.map((c) => c.deadlineHours - (t - new Date(c.startedAt).getTime()) / 36e5).filter((h) => Number.isFinite(h))
  return left.length ? Math.min(...left) : null
}

/** One row per deployment, with the tightest deadline computed from its clocks. Sort and filter in place. */
export function FleetBoard({ title, rows, now, className }: FleetBoardProps & { now?: string | Date; className?: string }) {
  const [sort, setSort] = useState<SortKey>('status')
  const [filter, setFilter] = useState<Status | 'all'>('all')

  const view = useMemo(() => {
    const withDue = rows.map((row) => ({ row, due: soonestDue(row, now) }))
    const kept = withDue.filter((x) => filter === 'all' || x.row.status === filter)
    return kept.sort((a, b) => {
      if (sort === 'name') return a.row.name.localeCompare(b.row.name)
      if (sort === 'due') return (a.due ?? Infinity) - (b.due ?? Infinity)
      return RANK[a.row.status] - RANK[b.row.status] || a.row.name.localeCompare(b.row.name)
    })
  }, [rows, now, sort, filter])

  const counts = { all: rows.length, breached: 0, watch: 0, ok: 0 }
  for (const r of rows) counts[r.status]++
  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort === key ? 'ascending' : 'none'}>
      <button type="button" className="ic-sortbtn" onClick={() => setSort(key)}>{label}{sort === key ? ' ↑' : ''}</button>
    </th>
  )

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
        <div className="ic-chips" role="group" aria-label="Filter by status">
          {(['all', 'breached', 'watch', 'ok'] as const).map((f) => (
            <button type="button" key={f} className="ic-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'ok' ? 'On track' : f === 'watch' ? 'Watch' : 'Breached'} {counts[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="ic-scroll">
        <table className="ic-table">
          <thead>
            <tr>{th('name', 'Deployment')}<th scope="col">Model</th>{th('status', 'Status')}{th('due', 'Next deadline')}</tr>
          </thead>
          <tbody>
            {view.map(({ row, due }) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className="ic-mono ic-sub">{row.model ?? ''}</td>
                <td><span className="ic-pill" data-tone={row.status === 'ok' ? 'good' : row.status === 'watch' ? 'warn' : 'bad'}>{row.status === 'ok' ? 'On track' : row.status === 'watch' ? 'Watch' : 'Breached'}</span></td>
                <td>
                  {due === null ? <span className="ic-sub">{row.clocks.length ? `${row.clocks.length} open` : 'None open'}</span>
                    : due < 0 ? <span style={{ color: 'var(--ic-bad)' }}>Overdue {formatHours(-due)}</span>
                    : <span>{formatHours(due)} left</span>}
                  {row.clocks[0] && <div className="ic-sub">{row.clocks[0].label}</div>}
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={4} className="ic-sub">Nothing matches this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
