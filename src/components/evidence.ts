// Rules for showing where each extracted value came from. The point of each: a value is sourced or it is not, and
// two sources that disagree are a conflict, whatever a model says about its confidence.

/** One place a value was read from. `read` is what that source says, when it differs or needs checking. */
export type EvidenceSource = { id: string; label: string; locator?: string; excerpt?: string; read?: string; readAt?: string }
export type EvidenceRow = { id: string; field: string; value: string; sources: EvidenceSource[] }
export type RowStatus = 'sourced' | 'unsourced' | 'conflict'
export type JudgedRow = { row: EvidenceRow; status: RowStatus; conflicts: EvidenceSource[] }
export type EvidenceSummary = { total: number; withSource: number; unsourced: number; conflicts: number; text: string }

/** Money and numbers compare as numbers ("$12,400.00" equals "12400"). Everything else compares as trimmed, lower-case words. */
export function sameValue(a: string, b: string): boolean {
  const num = (s: string) => {
    const t = s.replace(/[,$£€\s]/g, '')
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
  }
  const x = num(a)
  const y = num(b)
  if (x !== null && y !== null) return x === y
  const words = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return words(a) === words(b)
}

export function judgeEvidence(rows: EvidenceRow[]): { rows: JudgedRow[]; summary: EvidenceSummary } {
  const judged = rows.map((row): JudgedRow => {
    const conflicts = row.sources.filter((s) => s.read !== undefined && !sameValue(s.read, row.value))
    const status: RowStatus = conflicts.length ? 'conflict' : row.sources.length ? 'sourced' : 'unsourced'
    return { row, status, conflicts }
  })
  const total = rows.length
  const withSource = judged.filter((j) => j.row.sources.length > 0).length
  const unsourced = judged.filter((j) => j.status === 'unsourced').length
  const conflicts = judged.filter((j) => j.status === 'conflict').length
  const text = total === 0 ? 'No values yet.' : `${withSource} of ${total} values have a source` + (conflicts ? `, ${conflicts} in conflict` : '')
  return { rows: judged, summary: { total, withSource, unsourced, conflicts, text } }
}
