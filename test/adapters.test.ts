import { describe, expect, it } from 'vitest'
import { kindFromAttributes, spansFromOtlp, type OtlpExport } from '../src/adapters/otel.js'
import { stepsFromAiSdk } from '../src/adapters/aisdk.js'
import { alignPlan } from '../src/components/planactual.js'
import { joinGuarantees, recordExport, summarizeRecord } from '../src/components/recordview.js'
import type { VerifyResult } from '../src/verify/types.js'

const T0 = 1_780_000_000_000_000_000n
const ns = (ms: number) => (T0 + BigInt(Math.round(ms * 1e6))).toString()
const kv = (key: string, v: string | number | boolean) => ({
  key,
  value: typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { boolValue: v } : Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v },
})
const otlp = (spans: object[]): OtlpExport => ({ resourceSpans: [{ scopeSpans: [{ spans: spans as never }] }] })

describe('spansFromOtlp', () => {
  const data = otlp([
    { traceId: 't1', spanId: 'a', name: 'invoice run', startTimeUnixNano: ns(0), endTimeUnixNano: ns(900), attributes: [kv('gen_ai.operation.name', 'invoke_agent')] },
    { traceId: 't1', spanId: 'b', parentSpanId: 'a', name: 'chat', startTimeUnixNano: ns(100), endTimeUnixNano: ns(400.5), attributes: [kv('gen_ai.operation.name', 'chat'), kv('gen_ai.usage.input_tokens', 812), kv('gen_ai.usage.output_tokens', 64), kv('cost.usd', 0.0123)] },
    { traceId: 't1', spanId: 'c', parentSpanId: 'a', name: 'lookup', startTimeUnixNano: ns(450), endTimeUnixNano: ns(800), attributes: [kv('gen_ai.tool.name', 'lookup_po'), kv('gen_ai.tool.call.arguments', '{"po":"PO-8810"}')], status: { code: 2, message: 'timeout' } },
  ])
  it('turns nanosecond times into milliseconds from the earliest start', () => {
    const [a, b, c] = spansFromOtlp(data)
    expect(a!.startMs).toBe(0)
    expect(b!.startMs).toBeCloseTo(100)
    expect(b!.durationMs).toBeCloseTo(300.5)
    expect(c!.startMs).toBeCloseTo(450)
  })
  it('keeps parents, token counts and the tool arguments', () => {
    const [, b, c] = spansFromOtlp(data)
    expect(b!.parentId).toBe('a')
    expect(b!.tokens).toEqual({ in: 812, out: 64 })
    expect(c!.input).toBe('{"po":"PO-8810"}')
  })
  it('reads error status and carries the message as output', () => {
    const c = spansFromOtlp(data)[2]!
    expect(c.status).toBe('error')
    expect(c.output).toBe('timeout')
  })
  it('has no cost unless you say where it is kept, and never makes one up', () => {
    expect(spansFromOtlp(data)[1]!.costUsd).toBeUndefined()
    expect(spansFromOtlp(data, { costAttribute: 'cost.usd' })[1]!.costUsd).toBeCloseTo(0.0123)
  })
  it('maps kinds from GenAI and OpenInference attributes, then the name', () => {
    expect(spansFromOtlp(data).map((s) => s.kind)).toEqual(['agent', 'llm', 'tool'])
    expect(kindFromAttributes('x', { 'openinference.span.kind': 'RETRIEVER' })).toBe('retrieval')
    expect(kindFromAttributes('vector search', {})).toBe('retrieval')
    expect(kindFromAttributes('anything', {})).toBe('agent')
  })
  it('lets the caller decide a kind', () => {
    expect(spansFromOtlp(data, { kindOf: (s) => (s.name === 'lookup' ? 'retrieval' : undefined) })[2]!.kind).toBe('retrieval')
  })
  it('keeps ids unique across traces and can pick one trace', () => {
    const two = otlp([
      { traceId: 'x', spanId: '1', name: 'a', startTimeUnixNano: ns(0), endTimeUnixNano: ns(5) },
      { traceId: 'y', spanId: '1', name: 'b', startTimeUnixNano: ns(2), endTimeUnixNano: ns(9) },
    ])
    expect(new Set(spansFromOtlp(two).map((s) => s.id)).size).toBe(2)
    expect(spansFromOtlp(two, { traceId: 'y' }).map((s) => s.name)).toEqual(['b'])
  })
  it('returns nothing for an empty export and survives a backwards span', () => {
    expect(spansFromOtlp({})).toEqual([])
    expect(spansFromOtlp(otlp([{ spanId: '1', name: 'z', startTimeUnixNano: ns(10), endTimeUnixNano: ns(5) }]))[0]!.durationMs).toBe(0)
  })
})

describe('stepsFromAiSdk', () => {
  const messages = [
    { id: 'm1', role: 'assistant', parts: [
      { type: 'text' },
      { type: 'tool-lookupPo', toolCallId: 'c1', state: 'output-available', input: {}, output: {} },
      { type: 'tool-check_duplicates', toolCallId: 'c2', state: 'output-error', errorText: 'boom' },
      { type: 'dynamic-tool', toolName: 'release-payment', toolCallId: 'c3', state: 'output-denied' },
      { type: 'tool-fetchVendor', toolCallId: 'c4', state: 'input-available' },
      { type: 'tool-writeRecord', toolCallId: 'c5', state: 'input-streaming' },
    ] },
  ]
  it('counts only calls with an outcome, in order', () => {
    expect(stepsFromAiSdk(messages).map((s) => [s.id, s.status])).toEqual([['c1', 'ok'], ['c2', 'error'], ['c3', 'blocked']])
  })
  it('words tool names and honours labels and plan ids', () => {
    expect(stepsFromAiSdk(messages).map((s) => s.action)).toEqual(['lookup po', 'check duplicates', 'release payment'])
    const s = stepsFromAiSdk(messages, { label: (n) => `Run ${n}`, planIds: { lookupPo: 'po' } })
    expect(s[0]).toMatchObject({ action: 'Run lookupPo', planId: 'po' })
  })
  it('feeds PlanVsActual: a call that never finished is not an executed step', () => {
    const plan = [{ id: 'po', action: 'lookup po' }, { id: 'vendor', action: 'fetch vendor' }]
    const r = alignPlan(plan, stepsFromAiSdk(messages))
    expect(r.rows.find((x) => x.plan.id === 'vendor')!.state).toBe('skipped')
    expect(r.rows.find((x) => x.plan.id === 'po')!.state).toBe('done')
  })
  it('treats a denied approval flag as blocked', () => {
    expect(stepsFromAiSdk([{ parts: [{ type: 'tool-pay', toolCallId: 'x', approval: { approved: false } }] }])[0]!.status).toBe('blocked')
  })
})

describe('summarizeRecord', () => {
  const clean = (): VerifyResult => ({
    ok: true, engagement: 'Acme', manifestSha256: 'a'.repeat(64), verifiedAt: '2026-06-10T12:00:00Z', problems: [],
    signatures: [{ party: 'provider', valid: true }, { party: 'client', valid: true }],
    ledger: { events: 2, intact: true },
    guarantees: [{ id: 'g1', status: 'honored', detail: '', remedyOutstanding: false }, { id: 'g2', status: 'remedied', detail: '', remedyOutstanding: false }],
    events: [
      { seq: 0, type: 'x', at: '2026-06-01T00:00:00Z', by: 'p', hash: 'abc', signatureValid: true, chainValid: true },
      { seq: 1, type: 'y', at: '2026-06-02T00:00:00Z', by: 'p', hash: 'def', signatureValid: true, chainValid: true },
    ],
  })
  it('says verified only when the details agree', () => {
    const s = summarizeRecord(clean())
    expect(s.trust).toBe('verified')
    expect(s.text).toBe('Verified. 2 signed events, every signature valid, 2 of 2 guarantees honored or remedied.')
  })
  it('does not trust ok: true when an event is bad', () => {
    const r = clean()
    r.events[1]!.chainValid = false
    expect(summarizeRecord(r).trust).toBe('inconsistent')
  })
  it('does not trust ok: true with a breach left unremedied or a problem listed', () => {
    const a = clean(); a.guarantees[0] = { id: 'g1', status: 'breached', detail: '', remedyOutstanding: true }
    expect(summarizeRecord(a).trust).toBe('inconsistent')
    const b = clean(); b.problems = ['something']
    expect(summarizeRecord(b).trust).toBe('inconsistent')
  })
  it('names what failed', () => {
    const r = clean()
    r.ok = false
    r.signatures[1] = { party: 'client', valid: false }
    r.events[1]!.signatureValid = false
    r.ledger.intact = false
    r.guarantees[0] = { id: 'g1', status: 'breached', detail: '', remedyOutstanding: true }
    const s = summarizeRecord(r)
    expect(s.trust).toBe('failed')
    expect(s.brokenEvents).toEqual([1])
    expect(s.badSignatures).toEqual(['client'])
    expect(s.outstanding).toEqual(['g1'])
    expect(s.text).toBe('Verification failed: a signature did not match (client); 1 ledger event changed or out of order (#1); 1 breach with no remedy (g1).')
  })
  it('joins promises to results and keeps a promise the verifier skipped as pending', () => {
    const manifest = { engagement: 'Acme', guarantees: [{ id: 'g1', statement: 's', check: 'c', remedy: 'r' }, { id: 'g9', statement: 's9', check: 'c', remedy: 'r' }] }
    const lines = joinGuarantees(manifest, clean().guarantees)
    expect(lines.map((l) => [l.id, l.status])).toEqual([['g1', 'honored'], ['g9', 'pending'], ['g2', 'remedied']])
  })
  it('exports the verifier output with a note, not a signature', () => {
    const out = JSON.parse(recordExport(clean(), { engagement: 'Acme', guarantees: [] }))
    expect(out.note).toMatch(/output of the verifier/)
    expect(out.ok).toBe(true)
    expect(out.manifest.engagement).toBe('Acme')
    expect(out.sig).toBeUndefined()
  })
})
