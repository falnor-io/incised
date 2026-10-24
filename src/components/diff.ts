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
