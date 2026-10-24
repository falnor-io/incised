export type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

/** Longest-common-subsequence diff over any two lists of strings. Quadratic, so callers cap the input. */
export function diffSeq(a: string[], b: string[]): DiffOp[] {
  const m = a.length
  const n = b.length
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) out.push({ type: 'same', text: a[i]! }), i++, j++
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ type: 'del', text: a[i++]! })
    else out.push({ type: 'add', text: b[j++]! })
  }
  while (i < m) out.push({ type: 'del', text: a[i++]! })
  while (j < n) out.push({ type: 'add', text: b[j++]! })
  return out
}

export const splitWords = (s: string) => s.split(/(\s+)/).filter((w) => w !== '')

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number }
export type Segment = { kind: 'lines'; lines: DiffLine[]; header: string } | { kind: 'gap'; lines: DiffLine[]; id: number }

/** Numbers every line of a diff against the old and new text. */
export function numberLines(ops: DiffOp[]): DiffLine[] {
  let o = 0
  let n = 0
  return ops.map((op) => (op.type === 'same' ? { ...op, oldNo: ++o, newNo: ++n } : op.type === 'del' ? { ...op, oldNo: ++o } : { ...op, newNo: ++n }))
}

/**
 * Splits a numbered diff into visible hunks and hidden gaps of unchanged lines, keeping `context` lines around
 * every change. Each hunk gets a header like "@@ -12,7 +12,8 @@".
 */
export function toSegments(lines: DiffLine[], context = 3): Segment[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out: Segment[] = []
  let i = 0
  let gapId = 0
  while (i < lines.length) {
    const start = i
    const visible = keep[i]!
    while (i < lines.length && keep[i] === visible) i++
    const run = lines.slice(start, i)
    if (visible) {
      const oldLines = run.filter((l) => l.oldNo !== undefined)
      const newLines = run.filter((l) => l.newNo !== undefined)
      const oldStart = oldLines[0]?.oldNo ?? 0
      const newStart = newLines[0]?.newNo ?? 0
      out.push({ kind: 'lines', lines: run, header: `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@` })
    } else out.push({ kind: 'gap', lines: run, id: gapId++ })
  }
  return out
}

export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((l) => l.type === 'add').length, removed: lines.filter((l) => l.type === 'del').length }
}
