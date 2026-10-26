import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ChainGraph, EvalMatrix, FleetBoard, ReceiptCard, diffSeq, soonestDue,
} from '../src/index.js'
import { mcnemarExact } from '../src/verify/index.js'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('mcnemarExact', () => {
  it('matches the registry calculator', () => {
    expect(mcnemarExact(8, 1)).toBeCloseTo(0.0391, 3)
    expect(mcnemarExact(0, 0)).toBe(1)
    expect(mcnemarExact(3, 3)).toBe(1)
  })
})


describe('EvalMatrix', () => {
  const cases = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, label: `Case ${i}` }))
  const all = Object.fromEntries(cases.map((c) => [c.id, true]))
  it('flags a significant regression', () => {
    const worse = { ...all, c0: false, c1: false, c2: false, c3: false, c4: false, c5: false, c6: false, c7: false }
    const out = html(<EvalMatrix title="Re-test" cases={cases} runs={[{ label: 'v1', results: all }, { label: 'v2', results: worse }]} />)
    expect(out).toContain('Regression: 8 worse, 0 better')
  })
  it('does not call a single flip a regression', () => {
    const one = { ...all, c0: false }
    const out = html(<EvalMatrix title="Re-test" cases={cases} runs={[{ label: 'v1', results: all }, { label: 'v2', results: one }]} />)
    expect(out).toContain('Possible drift')
    expect(out).not.toContain('Regression:')
  })
})

describe('FleetBoard', () => {
  const rows = [
    { name: 'AP exceptions', status: 'ok' as const, clocks: [{ label: 'Re-test', startedAt: '2026-06-03T00:00:00Z', deadlineHours: 48 }] },
    { name: 'Claims intake', status: 'breached' as const, clocks: [{ label: 'Root cause', startedAt: '2026-06-01T00:00:00Z', deadlineHours: 24 }] },
  ]
  it('computes the soonest deadline and marks overdue ones', () => {
    expect(soonestDue(rows[0]!, '2026-06-04T00:00:00Z')).toBe(24)
    expect(soonestDue(rows[1]!, '2026-06-04T00:00:00Z')).toBe(-48)
    const out = html(<FleetBoard title="Fleet" rows={rows} now="2026-06-04T00:00:00Z" />)
    expect(out).toContain('Overdue 48.0h')
    expect(out.indexOf('Claims intake')).toBeLessThan(out.indexOf('AP exceptions'))
  })
  it('shows no time when there is no clock reading', () => {
    expect(soonestDue(rows[0]!)).toBeNull()
  })
})



describe('ChainGraph and ReceiptCard', () => {
  const events = [
    { seq: 1, type: 'launch', at: '2026-06-01T00:00:00Z', by: 'a', hash: 'aaaaaaaaaaaa', signatureValid: true, chainValid: true },
    { seq: 2, type: 'retest', at: '2026-06-02T00:00:00Z', by: 'a', hash: 'bbbbbbbbbbbb', signatureValid: false, chainValid: false },
  ]
  it('shows a broken link and a bad signature', () => {
    const out = html(<ChainGraph events={events} />)
    expect(out).toContain('chain link broken')
    expect(out).toContain('Signature invalid')
    expect(out).toContain('← genesis')
  })
  it('flags a signature problem on a receipt', () => {
    const out = html(<ReceiptCard title="Payment hold" issuedAt="2026-06-05T08:00:00Z" rows={[{ label: 'Amount', value: '$12,400' }]} hash="abc" signers={[{ party: 'agent', valid: true }, { party: 'controller', valid: false }]} />)
    expect(out).toContain('signature problem')
  })
})

import { DiffViewer, numberLines, toSegments, countChanges } from '../src/index.js'
describe('diff segments', () => {
  const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
  const b = [...a]
  b[14] = 'line 15 changed'
  const lines = numberLines(diffSeq(a, b))
  it('numbers lines against both sides', () => {
    const del = lines.find((l) => l.type === 'del')!
    const add = lines.find((l) => l.type === 'add')!
    expect([del.oldNo, del.newNo, add.oldNo, add.newNo]).toEqual([15, undefined, undefined, 15])
    expect(lines.at(-1)).toMatchObject({ oldNo: 30, newNo: 30 })
  })
  it('keeps three lines of context and folds the rest, with a correct header', () => {
    const segs = toSegments(lines, 3)
    expect(segs.map((s) => s.kind)).toEqual(['gap', 'lines', 'gap'])
    const hunk = segs[1]!
    expect(hunk.kind === 'lines' && hunk.header).toBe('@@ -12,7 +12,7 @@')
    expect(segs[0]!.lines).toHaveLength(11)
    expect(segs[2]!.lines).toHaveLength(12)
  })
  it('counts changes', () => expect(countChanges(lines)).toEqual({ added: 1, removed: 1, moved: 0 }))
  it('renders folded context, stats and a comment', () => {
    const out = renderToStaticMarkup(<DiffViewer title="d" files={[{ path: 'a/b.txt', before: a.join('\n'), after: b.join('\n') }]} comments={[{ path: 'a/b.txt', line: 15, author: 'reviewer', text: 'Why?' }]} />)
    expect(out).toContain('Show 11 unchanged lines')
    expect(out).toContain('@@ -12,7 +12,7 @@')
    expect(out).toContain('+1')
    expect(out).toContain('reviewer')
  })
})
