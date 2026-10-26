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

import { itemsFromInterrupt, responseFromDecisions, type HitlRequest } from '../src/adapters/langgraph.js'
import { cannotDecide, judgeItem } from '../src/components/approval.js'

describe('itemsFromInterrupt', () => {
  const req: HitlRequest = {
    actionRequests: [
      { name: 'send_email', args: { to: 'ap@acme.com', subject: 'Hi' }, description: 'Email the vendor.' },
      { name: 'deleteRecord', args: { id: 7 } },
    ],
    reviewConfigs: [{ allowedDecisions: ['approve', 'reject', 'edit', 'respond'] }, { allowedDecisions: ['approve', 'reject'] }],
  }
  it('makes one item per action, with the exact call as the plan', () => {
    const items = itemsFromInterrupt(req, { id: 'i1' })
    expect(items.map((i) => i.id)).toEqual(['i1:0', 'i1:1'])
    expect(items[0]!.plan).toEqual({ tool: 'send_email', args: { to: 'ap@acme.com', subject: 'Hi' } })
    expect(items[0]!.action).toBe('send email')
    expect(items[1]!.action).toBe('delete record')
    expect(items[0]!.summary).toBe('Email the vendor.')
  })
  it('invents no evidence and treats an action as not undoable unless told otherwise', () => {
    const [a] = itemsFromInterrupt(req, { id: 'i1' })
    expect(a!.evidence).toEqual([])
    expect(a!.reversible).toBe(false)
    expect(itemsFromInterrupt(req, { id: 'i1', reversible: () => ({}) })[0]!.reversible).toEqual({})
  })
  it('passes through which decisions the interrupt allows', () => {
    const [a, b] = itemsFromInterrupt(req, { id: 'i1' })
    expect(a!.allowed).toEqual(['approve', 'reject', 'respond'])
    expect(a!.editable).toBe(true)
    expect(b!.allowed).toEqual(['approve', 'reject'])
    expect(b!.editable).toBe(false)
  })
})

describe('responseFromDecisions', () => {
  const req: HitlRequest = {
    actionRequests: [{ name: 'send_email', args: { subject: 'Hi' } }, { name: 'pay', args: { amount: 5 } }],
    reviewConfigs: [{ allowedDecisions: ['approve', 'reject', 'edit', 'respond'] }, { allowedDecisions: ['approve', 'reject'] }],
  }
  const items = itemsFromInterrupt(req, { id: 'i' })
  it('will not answer for a reviewer who has not decided', () => {
    const r = responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'approve' } })
    expect(r).toEqual({ ok: false, problem: 'No decision yet for pay.' })
  })
  it('maps approve, reject and respond', () => {
    const r = responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'respond', message: 'Blue.' }, 'i:1': { kind: 'reject', message: 'no' } })
    expect(r).toEqual({ ok: true, response: { decisions: [{ type: 'respond', message: 'Blue.' }, { type: 'reject', message: 'no' }] } })
    const a = responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'approve' }, 'i:1': { kind: 'approve' } })
    expect(a).toEqual({ ok: true, response: { decisions: [{ type: 'approve' }, { type: 'approve' }] } })
  })
  it('turns an approval of an edited plan into an edit', () => {
    const edited = items.map((i) => (i.id === 'i:0' ? { ...i, plan: { tool: 'send_email', args: { subject: 'Softer' } } } : i))
    const r = responseFromDecisions(req, 'i', edited, { 'i:0': { kind: 'approve' }, 'i:1': { kind: 'approve' } })
    expect(r).toEqual({ ok: true, response: { decisions: [{ type: 'edit', editedAction: { name: 'send_email', args: { subject: 'Softer' } } }, { type: 'approve' }] } })
  })
  it('refuses an edit, a reply or a rejection the interrupt did not allow', () => {
    const edited = items.map((i) => (i.id === 'i:1' ? { ...i, plan: { tool: 'pay', args: { amount: 9 } } } : i))
    expect(responseFromDecisions(req, 'i', edited, { 'i:0': { kind: 'approve' }, 'i:1': { kind: 'approve' } })).toMatchObject({ ok: false, problem: 'Editing pay is not allowed here.' })
    expect(responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'approve' }, 'i:1': { kind: 'respond', message: 'x' } })).toMatchObject({ ok: false })
  })
  it('needs words for a reply, and sends an escalation as a rejection that says so', () => {
    expect(responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'respond' }, 'i:1': { kind: 'approve' } })).toMatchObject({ ok: false, problem: 'Write the reply for send email.' })
    const r = responseFromDecisions(req, 'i', items, { 'i:0': { kind: 'approve' }, 'i:1': { kind: 'escalate' } })
    expect(r).toMatchObject({ ok: true })
    expect((r as { response: { decisions: { type: string; message?: string }[] } }).response.decisions[1]).toMatchObject({ type: 'reject' })
  })
  it('reads a recorded Decision as well as a plain choice', () => {
    const d = { by: 'raj', decision: 'reject' as const, at: '2026-06-10T00:00:00Z', planHash: 'h', message: 'tone' }
    expect(responseFromDecisions({ actionRequests: [req.actionRequests[0]!], reviewConfigs: [req.reviewConfigs[0]!] }, 'i', items, { 'i:0': d })).toEqual({ ok: true, response: { decisions: [{ type: 'reject', message: 'tone' }] } })
  })
})

describe('respond decisions in the queue rules', () => {
  const item = { id: 'q', action: 'x', summary: '', requester: 'agent', risk: 'low' as const, plan: {}, evidence: [], reversible: false as const, needs: 1, decisions: [{ by: 'raj', decision: 'respond' as const, at: '2026-06-10T00:00:00Z', planHash: 'h', message: 'ask again' }] }
  it('ends the item as answered, with nothing run', () => {
    const j = judgeItem(item, 'h', new Date('2026-06-10T12:00:00Z'))
    expect(j.status).toBe('responded')
    expect(j.reason).toBe('A reviewer answered the agent instead. Nothing ran.')
    expect(cannotDecide(item, j, 'kim')).toBe('This is already decided.')
  })
  it('does not count a reply made on an older plan', () => {
    expect(judgeItem(item, 'h2', new Date('2026-06-10T12:00:00Z')).status).toBe('pending')
  })
})
