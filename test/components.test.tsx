import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import {
  ApprovalGate, Bottlenecks, Compare, ConfidenceBar, Funnel, GuaranteeCard, LedgerTimeline, Priority, RecordProvider,
  RetestClock, Swimlane, Trail, VerifyStatus, componentSchemas,
} from '../src/index.js'
import { verifyRecord } from '../src/verify/index.js'
import type { RecordBundle } from '../src/verify/index.js'

const record = (): RecordBundle => JSON.parse(readFileSync(new URL('../demo/sample-record.json', import.meta.url), 'utf8'))
const NOW = new Date('2026-06-10T00:00:00Z')
const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('workflow components', () => {
  it('Trail computes total wait itself', () => {
    const out = html(<Trail title="t" request="r" stops={[
      { owner: 'a', name: 'one', note: 'n', waitDays: 2 },
      { owner: 'b', name: 'two', note: 'n', waitDays: 3 },
    ]} />)
    expect(out).toContain('waits 5 days across 2 stops')
  })
  it('Funnel computes share kept', () => {
    const out = html(<Funnel title="f" unit="deals" steps={[{ label: 'a', value: 40 }, { label: 'b', value: 30 }]} />)
    expect(out).toContain('75% kept')
  })
  it('Bottlenecks marks the biggest bar', () => {
    const out = html(<Bottlenecks title="b" unit="days" items={[{ stage: 'x', amount: 2 }, { stage: 'y', amount: 4 }]} />)
    expect(out.match(/data-top="true"/g)).toHaveLength(1)
  })
  it('Priority places items in quadrants and states it is a judgement', () => {
    const out = html(<Priority title="p" items={[{ label: 'Handoff', impact: 'high', effort: 'low' }, { label: 'Setup', impact: 'low', effort: 'high' }]} />)
    expect(out).toMatch(/Quick wins<\/h4><ul><li>Handoff/)
    expect(out).toContain('A judgement, not a measurement.')
  })
  it('Swimlane, Compare render', () => {
    expect(html(<Swimlane title="s" lanes={[{ owner: 'Ops', steps: [{ name: 'a', waiting: true }, { name: 'b' }] }]} />)).toContain('waits')
    expect(html(<Compare title="c" leftLabel="Today" rightLabel="Mapped" rows={[{ label: 'Owner', left: 'x', right: 'y' }]} />)).toContain('Mapped')
  })
})

describe('record components', () => {
  it('VerifyStatus never shows a pass without a result', () => {
    const out = html(<VerifyStatus />)
    expect(out).toContain('Not verified')
    expect(out).not.toContain('Verified')
  })
  it('VerifyStatus shows pass for a good record and failure for a tampered one', async () => {
    const good = await verifyRecord(record(), { now: NOW })
    expect(html(<VerifyStatus result={good} />)).toContain('>Verified<')
    const bad = record()
    bad.ledger[3]!.result = 'fail'
    const r = await verifyRecord(bad, { now: NOW })
    const out = html(<VerifyStatus result={r} />)
    expect(out).toContain('Verification failed')
    expect(out).toContain('chain broken')
  })
  it('LedgerTimeline reads from RecordProvider and flags a broken link', async () => {
    const bad = record()
    bad.ledger[3]!.result = 'fail'
    const r = await verifyRecord(bad, { now: NOW })
    const out = html(<RecordProvider result={r}><LedgerTimeline /></RecordProvider>)
    expect(out).toContain('Signature invalid')
    expect(out).toContain('Chain link broken')
  })
  it('GuaranteeCard and ApprovalGate render states', () => {
    expect(html(<GuaranteeCard id="G2" statement="s" check="c" remedy="r" status="breached" />)).toContain('remedy outstanding')
    expect(html(<ApprovalGate action="Pay invoice" approver="Controller" state="escalated" />)).toContain('Escalated, as designed')
  })
  it('RetestClock reports met, missed and open from dates', () => {
    const base = { label: 'Re-test', startedAt: '2026-06-03T00:00:00Z', deadlineHours: 48 }
    expect(html(<RetestClock {...base} resolvedAt="2026-06-04T06:00:00Z" />)).toContain('Met in 30.0h')
    expect(html(<RetestClock {...base} resolvedAt="2026-06-06T00:00:00Z" />)).toContain('Missed by 24.0h')
    expect(html(<RetestClock {...base} now="2026-06-04T00:00:00Z" />)).toContain('24.0h left')
    expect(html(<RetestClock {...base} now="2026-06-09T00:00:00Z" remedied={false} />)).toContain('remedy outstanding')
  })
  it('ConfidenceBar refuses to claim from a small sample', () => {
    const out = html(<ConfidenceBar label="Accuracy" passes={45} n={50} threshold={0.9} />)
    expect(out).toContain('Cannot claim 90%')
    const strong = html(<ConfidenceBar label="Accuracy" passes={990} n={1000} threshold={0.95} />)
    expect(strong).toContain('Supports 95% or better')
  })
  it('ConfidenceBar words zero failures as a bound, not a guarantee', () => {
    expect(html(<ConfidenceBar label="Gate" passes={50} n={50} />)).toContain('true failure rate under 5.8%')
  })
  it('ConfidenceBar survives invalid counts', () => {
    expect(html(<ConfidenceBar label="x" passes={9} n={4} />)).toContain('not valid')
  })
})

describe('schemas', () => {
  it('reject out-of-range model output', () => {
    expect(componentSchemas.Funnel.safeParse({ title: 't', unit: 'u', steps: [{ label: 'a', value: 1 }] }).success).toBe(false)
    expect(componentSchemas.Priority.safeParse({ title: 't', items: [{ label: 'a', impact: 'huge', effort: 'low' }, { label: 'b', impact: 'low', effort: 'low' }] }).success).toBe(false)
  })
})
