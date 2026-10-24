// Pure data logic for the data grid: filtering, multi-column sort, windowing and CSV. No React.

export type ColumnType = 'text' | 'number' | 'status' | 'duration' | 'percent' | 'usd' | 'date' | 'spark'
export type Column<R> = {
  id: string
  header: string
  value: (row: R) => unknown
  type?: ColumnType
  width?: number
  minWidth?: number
  sortable?: boolean
  filterable?: boolean
  pin?: boolean
  aggregate?: 'sum' | 'avg'
  tone?: (value: unknown) => 'good' | 'warn' | 'bad' | undefined
}
export type SortKey = { id: string; dir: 'asc' | 'desc' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Number filters: ">100", "<=5", "10..20", or a plain number meaning equals. Returns null when it does not parse. */
export function parseNumberFilter(input: string): ((n: number) => boolean) | null {
  const s = input.trim()
  if (!s) return null
  const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(s)
  if (range) {
    const [lo, hi] = [Number(range[1]), Number(range[2])]
    return (n) => n >= Math.min(lo, hi) && n <= Math.max(lo, hi)
  }
  const cmp = /^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/.exec(s)
  if (!cmp) return null
  const v = Number(cmp[2])
  switch (cmp[1]) {
    case '>': return (n) => n > v
    case '>=': return (n) => n >= v
    case '<': return (n) => n < v
    case '<=': return (n) => n <= v
    default: return (n) => n === v
  }
}

const NUMERIC: ColumnType[] = ['number', 'duration', 'percent', 'usd']

export function matchesFilter<R>(col: Column<R>, row: R, filter: string): boolean {
  const v = col.value(row)
  if (NUMERIC.includes(col.type ?? 'text')) {
    const f = parseNumberFilter(filter)
    // An unparseable filter matches nothing, so a typo is visible instead of silently ignored.
    return f ? isNum(v) && f(v) : false
  }
  return String(v ?? '').toLowerCase().includes(filter.trim().toLowerCase())
}

export function filterRows<R>(rows: R[], columns: Column<R>[], filters: Record<string, string>, query: string): R[] {
  const active = Object.entries(filters).filter(([, f]) => f.trim() !== '')
  const q = query.trim().toLowerCase()
  if (!active.length && !q) return rows
  const byId = new Map(columns.map((c) => [c.id, c]))
  return rows.filter((row) => {
    for (const [id, f] of active) {
      const col = byId.get(id)
      if (col && !matchesFilter(col, row, f)) return false
    }
    return !q || columns.some((c) => c.type !== 'spark' && String(c.value(row) ?? '').toLowerCase().includes(q))
  })
}

function compare(a: unknown, b: unknown): number {
  const an = a === null || a === undefined || (typeof a === 'number' && Number.isNaN(a))
  const bn = b === null || b === undefined || (typeof b === 'number' && Number.isNaN(b))
  if (an || bn) return an === bn ? 0 : an ? 1 : -1 // blanks sort last in either direction
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** Stable multi-column sort. Blank values stay at the bottom whichever way you sort. */
export function sortRows<R>(rows: R[], columns: Column<R>[], sorts: SortKey[]): R[] {
  if (!sorts.length) return rows
  const byId = new Map(columns.map((c) => [c.id, c]))
  const keyed = rows.map((row, i) => ({ row, i }))
  keyed.sort((x, y) => {
    for (const s of sorts) {
      const col = byId.get(s.id)
      if (!col) continue
      const a = col.value(x.row)
      const b = col.value(y.row)
      const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
      let c = compare(a, b)
      if (!blank(a) && !blank(b) && s.dir === 'desc') c = -c
      if (c !== 0) return c
    }
    return x.i - y.i
  })
  return keyed.map((k) => k.row)
}

/** Click cycles a column ascending, descending, off. Shift-click keeps the other sorts as tie-breakers. */
export function nextSorts(sorts: SortKey[], id: string, additive: boolean): SortKey[] {
  const cur = sorts.find((s) => s.id === id)
  const next: SortKey | null = !cur ? { id, dir: 'asc' } : cur.dir === 'asc' ? { id, dir: 'desc' } : null
  const rest = additive ? sorts.filter((s) => s.id !== id) : []
  if (!next) return rest
  return additive && cur ? sorts.map((s) => (s.id === id ? next : s)) : [...rest, next]
}

/** Which rows to draw for a scroll position, with a little overscan either side. */
export function windowRange(scrollTop: number, viewport: number, rowH: number, total: number, overscan = 6): { start: number; end: number } {
  const start = Math.min(total, Math.max(0, Math.floor(scrollTop / rowH) - overscan))
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / rowH) + overscan)
  return { start, end: Math.max(start, end) }
}

/** CSV with quotes escaped. Cells that start with = + - @ get a leading apostrophe so a spreadsheet never runs them. */
export function toCsv<R>(rows: R[], columns: Column<R>[]): string {
  const cols = columns.filter((c) => c.type !== 'spark')
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? '')
    if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map((c) => cell(c.header)).join(','), ...rows.map((r) => cols.map((c) => cell(c.value(r))).join(','))].join('\n')
}

export function aggregate<R>(col: Column<R>, rows: R[]): number | null {
  if (!col.aggregate) return null
  const nums = rows.map((r) => col.value(r)).filter(isNum)
  if (!nums.length) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return col.aggregate === 'sum' ? sum : sum / nums.length
}

/** Range select between two row indexes, inclusive, as ids. */
export function rangeIds(ids: string[], a: number, b: number): string[] {
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return ids.slice(lo, hi + 1)
}
