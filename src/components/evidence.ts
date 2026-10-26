// Rules for showing where each extracted value came from. The point of each: a value is sourced or it is not, and
// two sources that disagree are a conflict, whatever a model says about its confidence.

/** One place a value was read from. `read` is what that source says, when it differs or needs checking. */
export type EvidenceSource = {
  id: string
  label: string
  locator?: string
  excerpt?: string
  read?: string
  readAt?: string
  /** Which of your documents this came from, so the excerpt can be found in its text. */
  docId?: string
}
export type EvidenceRow = { id: string; field: string; value: string; sources: EvidenceSource[] }
export type RowStatus = 'sourced' | 'unsourced' | 'conflict' | 'unverified'
/** `found`: the excerpt is in the document. `not-found`: it is not, so it was not quoted from there. `unchecked`: no document to look in. */
export type QuoteCheck = 'found' | 'not-found' | 'unchecked'
export type SourceCheck = { quote: QuoteCheck; /** Whether the excerpt contains the value the source is said to read. `null` when there is nothing to compare. */ excerptHasRead: boolean | null }
/** A value that is in the source documents, so it can be compared with what was extracted. */
export type AvailableValue = { id: string; field: string; value: string; docId?: string; locator?: string }
export type JudgedRow = { row: EvidenceRow; status: RowStatus; conflicts: EvidenceSource[]; checks: Record<string, SourceCheck> }
export type EvidenceSummary = {
  total: number
  withSource: number
  unsourced: number
  conflicts: number
  /** Rows with a quote that is not in its document. */
  unverified: number
  /** Values in the source that no row covers. */
  omitted: number
  text: string
}
export type EvidenceOptions = { documents?: Record<string, string>; available?: AvailableValue[] }

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

/** Quotes compare ignoring case, runs of spaces and curly quotes, so a line break in a PDF does not hide a real quote. */
const squash = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()

function hasValue(text: string, value: string): boolean {
  if (squash(text).includes(squash(value))) return true
  const wanted = Number(value.replace(/[,$£€\s]/g, ''))
  if (!Number.isFinite(wanted) || value.trim() === '') return false
  return (text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).some((t) => Number(t.replace(/,/g, '')) === wanted)
}

export function checkSource(s: EvidenceSource, documents?: Record<string, string>): SourceCheck {
  const doc = s.docId !== undefined && documents && Object.hasOwn(documents, s.docId) ? documents[s.docId] : undefined
  const quote: QuoteCheck = !s.excerpt || doc === undefined ? 'unchecked' : squash(doc).includes(squash(s.excerpt)) ? 'found' : 'not-found'
  const excerptHasRead = s.excerpt && s.read !== undefined ? hasValue(s.excerpt, s.read) : null
  return { quote, excerptHasRead }
}

export function judgeEvidence(rows: EvidenceRow[], options: EvidenceOptions = {}): { rows: JudgedRow[]; omitted: AvailableValue[]; summary: EvidenceSummary } {
  const judged = rows.map((row): JudgedRow => {
    const conflicts = row.sources.filter((s) => s.read !== undefined && !sameValue(s.read, row.value))
    const checks = Object.fromEntries(row.sources.map((s) => [s.id, checkSource(s, options.documents)]))
    const unverified = row.sources.some((s) => checks[s.id]!.quote === 'not-found' || checks[s.id]!.excerptHasRead === false)
    const status: RowStatus = conflicts.length ? 'conflict' : unverified ? 'unverified' : row.sources.length ? 'sourced' : 'unsourced'
    return { row, status, conflicts, checks }
  })
  const covered = new Set(rows.map((r) => squash(r.field)))
  const omitted = (options.available ?? []).filter((a) => !covered.has(squash(a.field)))
  const total = rows.length
  const withSource = judged.filter((j) => j.row.sources.length > 0).length
  const unsourced = judged.filter((j) => j.status === 'unsourced').length
  const conflicts = judged.filter((j) => j.status === 'conflict').length
  const unverified = judged.filter((j) => j.status === 'unverified').length
  const parts = [`${withSource} of ${total} values have a source`]
  if (conflicts) parts.push(`${conflicts} in conflict`)
  if (unverified) parts.push(`${unverified} with a quote that is not in the document`)
  if (omitted.length) parts.push(`${omitted.length} in the source not extracted`)
  const text = total === 0 && omitted.length === 0 ? 'No values yet.' : parts.join(', ')
  return { rows: judged, omitted, summary: { total, withSource, unsourced, conflicts, unverified, omitted: omitted.length, text } }
}
