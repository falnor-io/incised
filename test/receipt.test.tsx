// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createSourceStore, Drawing, SourcesProvider, decisionAction } from '../src/index.js'
import { createViewReceipt, signViewReceipt, verifyViewReceipt, viewDigest } from '../src/verify/index.js'

const data = { requester: 'agent', startedAt: '2026-06-10T08:00:00Z', steps: [{ id: 's1', role: 'Review', who: 'a' }], decisions: [], now: '2026-06-10T09:00:00Z' }

describe('view receipts', () => {
  it('signs what was shown and notices when the data is later different', async () => {
    const { publicKey, privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const receipt = await createViewReceipt({ component: 'Approval', kind: 'chains', source: 'p', data, by: 'raj', at: new Date('2026-06-10T09:00:00Z') })
    const signed = await signViewReceipt(receipt, privateKey)
    expect(await verifyViewReceipt(signed, publicKey, data)).toEqual({ signatureValid: true, dataMatches: true })
    expect(await verifyViewReceipt(signed, publicKey, { ...data, requester: 'someone else' })).toEqual({ signatureValid: true, dataMatches: false })
    const forged = { ...signed, receipt: { ...signed.receipt, by: 'mallory' } }
    expect((await verifyViewReceipt(forged, publicKey)).signatureValid).toBe(false)
  })
  it('hashes the same data to the same digest whatever the key order', async () => {
    expect(await viewDigest({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(await viewDigest({ b: [2, { d: 4, c: 3 }], a: 1 }))
  })
  it('carries the view hash on a decision action', () => {
    expect(decisionAction('x', 'approve', 'p', undefined, 'v')).toEqual({ name: 'decision', context: { id: 'x', decision: 'approve', planHash: 'p', viewHash: 'v' } })
  })
  it('Drawing makes one receipt per record shown, and none while partial', async () => {
    const store = createSourceStore({ chains: { p: data as never } })
    const got: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    const view = (status?: 'partial' | 'ready') => <SourcesProvider store={store}><Drawing kind="chains" source="p" title="Pay" viewer="raj" status={status} onShown={(x) => got.push(x)} /></SourcesProvider>
    await act(async () => { r.render(view('partial')) })
    expect(got).toHaveLength(0)
    await act(async () => { r.render(view('ready')) })
    await act(async () => { r.render(view('ready')) })
    // Hashing is asynchronous; wait for the receipt rather than for a fixed time.
    for (let i = 0; i < 100 && got.length === 0; i++) await act(async () => { await new Promise((x) => setTimeout(x, 20)) })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ schema: 'orlune.view.v1', by: 'raj', kind: 'chains', source: 'p' })
  })
})

import { ApprovalQueue, RecordViewer, ViewReceiptCard, judgeView, type QueueItem } from '../src/index.js'
import { renderToStaticMarkup } from 'react-dom/server'

const rcpt = { schema: 'orlune.view.v1' as const, component: 'Pay', kind: 'chains', source: 'p', dataHash: 'a'.repeat(64), by: 'raj', shownAt: '2026-06-10T09:41:00Z' }
const qitem = (): QueueItem => ({ id: 'q1', action: 'Pay', summary: 's', requester: 'agent', risk: 'low', plan: { a: 1 }, evidence: [{ label: 'PO matches', ok: true }], reversible: false, needs: 1, decisions: [], allowed: ['approve', 'reject'] })

describe('judging a view receipt', () => {
  it('only reads as unchanged for a valid signature on matching data', () => {
    expect(judgeView({ receipt: rcpt }).word).toBe('Not checked')
    expect(judgeView({ receipt: rcpt, signatureValid: false, dataMatches: true }).tone).toBe('bad')
    expect(judgeView({ receipt: rcpt, signatureValid: true, dataMatches: false }).word).toBe('Data has changed')
    expect(judgeView({ receipt: rcpt, signatureValid: true }).tone).toBe('warn')
    expect(judgeView({ receipt: rcpt, signatureValid: true, dataMatches: true }).tone).toBe('good')
  })
  it('draws the card and the record viewer Views tab', () => {
    expect(renderToStaticMarkup(<ViewReceiptCard receipt={rcpt} signatureValid dataMatches />)).toContain('Shown and unchanged')
    const result = { ok: true, engagement: 'E', manifestSha256: 'x', signatures: [], ledger: { events: 0, intact: true }, guarantees: [], events: [], problems: [], verifiedAt: '2026-06-10T00:00:00Z' }
    const out = renderToStaticMarkup(<RecordViewer title="r" result={result as never} receipts={[{ receipt: rcpt }]} />)
    expect(out).toContain('Views (1)')
    expect(renderToStaticMarkup(<RecordViewer title="r" result={result as never} />)).not.toContain('Views (')
  })
})

describe('ApprovalQueue bound to what was seen', () => {
  const mountQ = async (el: React.ReactElement) => {
    const h = document.createElement('div')
    document.body.appendChild(h)
    const r = createRoot(h)
    await act(async () => { r.render(el) })
    await act(async () => { await new Promise((x) => setTimeout(x, 30)) })
    return h
  }
  const approve = (h: HTMLElement) => [...h.querySelectorAll('button')].find((b) => /Approve/.test(b.textContent ?? ''))!
  it('sends the view hash and receipt with the decision', async () => {
    const actions: { name: string; context: Record<string, unknown> }[] = []
    const h = await mountQ(<ApprovalQueue title="q" items={[qitem()]} reviewer="raj" now="2026-06-10T12:00:00Z" requireView receipts={{ q1: 'a'.repeat(64) }} onAction={(a) => actions.push(a)} />)
    await act(async () => { approve(h).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((x) => setTimeout(x, 30)) })
    expect(actions).toHaveLength(1)
    expect(actions[0]!.context).toMatchObject({ id: 'q1', decision: 'approve', viewReceipt: 'a'.repeat(64) })
    expect(String(actions[0]!.context.viewHash)).toMatch(/^[0-9a-f]{64}$/)
  })
  it('does not let anyone decide until the view is recorded', async () => {
    const actions: unknown[] = []
    const h = await mountQ(<ApprovalQueue title="q" items={[qitem()]} reviewer="raj" now="2026-06-10T12:00:00Z" requireView onAction={(a) => actions.push(a)} />)
    expect(h.textContent).toContain('has not been recorded as shown to you yet')
    await act(async () => { approve(h).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((x) => setTimeout(x, 30)) })
    expect(actions).toHaveLength(0)
  })
})

import { propStatus, createSourceStore as makeStore } from '../src/index.js'
import { buildOrluneLibrary } from '../src/openui/index.js'

describe('streaming fields, in-place patches and kits', () => {
  it('marks only the last key of an open object as still arriving', () => {
    expect(propStatus({ title: 'a', rows: [1] }, false)).toEqual({ argsStatus: 'streaming', propStatus: { title: 'complete', rows: 'streaming' } })
    expect(propStatus({ title: 'a', rows: [1] }, true)).toEqual({ argsStatus: 'complete', propStatus: { title: 'complete', rows: 'complete' } })
    expect(propStatus(undefined, false)).toEqual({ argsStatus: 'streaming', propStatus: {} })
  })
  it('lets a model change an allowed field in place, and refuses the rest with a reason', () => {
    const store = makeStore({ budgets: { b1: { limit: 1500, spent: 860, period: 'month' } as never } })
    const rule = { allow: ['limit'], check: (n: Record<string, unknown>) => (Number(n.limit) >= 0 ? true : 'The limit cannot be negative.') }
    const ok = store.patch('budgets', 'b1', { limit: 2000 }, rule)
    expect(ok).toEqual({ ok: true, action: { name: 'patch', context: { kind: 'budgets', id: 'b1', fields: ['limit'], changes: { limit: 2000 } } } })
    expect((store.get().budgets as unknown as Record<string, { limit: number }>).b1!.limit).toBe(2000)
    expect(store.patch('budgets', 'b1', { spent: 0 }, rule)).toEqual({ ok: false, reason: 'spent cannot be changed here.' })
    expect(store.patch('budgets', 'b1', { limit: -1 }, rule)).toEqual({ ok: false, reason: 'The limit cannot be negative.' })
    expect(store.patch('budgets', 'nope', { limit: 1 }, rule).ok).toBe(false)
    expect((store.get().budgets as unknown as Record<string, { spent: number }>).b1!.spent).toBe(860)
    expect(makeStore({ traces: { t: [] } }).patch('traces', 't', { a: 1 }, { allow: ['a'] }).ok).toBe(false)
  })
  it('builds a smaller library from a kit', () => {
    const all = buildOrluneLibrary().prompt()
    const small = buildOrluneLibrary({ kit: 'workflow' }).prompt()
    expect(small).toContain('Funnel')
    expect(small).toContain('FunnelStep')
    expect(small).not.toContain('TraceExplorer')
    expect(all).toContain('TraceExplorer')
    expect(small.length).toBeLessThan(all.length)
    expect(buildOrluneLibrary({ kit: ['Trail'] }).prompt()).toContain('Stop')
  })
})

import { parsePartial } from '../src/index.js'
describe('reading JSON as it streams', () => {
  it('returns what is known so far and says when it is whole', () => {
    expect(parsePartial('{"title":"Sales","rows":[1,2')).toEqual({ value: { title: 'Sales', rows: [1, 2] }, complete: false })
    expect(parsePartial('{"title":"Sal')).toEqual({ value: { title: 'Sal' }, complete: false })
    expect(parsePartial('{"title":"Sales","rows"')).toEqual({ value: { title: 'Sales' }, complete: false })
    expect(parsePartial('{"title":"Sales","rows":')).toEqual({ value: { title: 'Sales' }, complete: false })
    expect(parsePartial('{"a":[{"b":1},')).toEqual({ value: { a: [{ b: 1 }] }, complete: false })
    expect(parsePartial('{"a":"x\\"y')).toEqual({ value: { a: 'x"y' }, complete: false })
    expect(parsePartial('{"a":1}')).toEqual({ value: { a: 1 }, complete: true })
  })
  it('feeds propStatus: the key being written is the last one present', () => {
    const p = parsePartial('{"title":"Sales","rows":[1,2')
    expect(propStatus(p.value as Record<string, unknown>, p.complete).propStatus).toEqual({ title: 'complete', rows: 'streaming' })
  })
})

import { Sketch, Annotated, checkSketch, sketchBeats, layoutBoxes, layoutLinks, LedgerTimeline } from '../src/index.js'
const skNodes = [
  { id: 'a', label: 'Plan', col: 0, row: 0, kind: 'input' as const },
  { id: 'b', label: 'Hash', col: 1, row: 0 },
  { id: 'c', label: 'Void', col: 2, row: 1, kind: 'output' as const },
]
describe('Sketch', () => {
  it('drops what cannot be drawn and says why', () => {
    const r = checkSketch([...skNodes, { id: 'a', label: 'again', col: 0, row: 0 }], [{ from: 'a', to: 'b' }, { from: 'a', to: 'zzz' }, { from: 'b', to: 'b' }])
    expect(r.nodes).toHaveLength(3)
    expect(r.arrows).toEqual([{ from: 'a', to: 'b' }])
    expect(r.problems).toHaveLength(3)
  })
  it('places boxes on the grid inside the width, and draws the same picture every time', () => {
    const { boxes, height } = layoutBoxes(skNodes, 600)
    for (const b of boxes.values()) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(600) }
    expect(boxes.get('c')!.y).toBeGreaterThan(boxes.get('a')!.y)
    expect(height).toBeGreaterThan(boxes.get('c')!.y + boxes.get('c')!.h)
    const a = layoutLinks([{ from: 'a', to: 'b' }], boxes)
    const b = layoutLinks([{ from: 'a', to: 'b' }], layoutBoxes(skNodes, 600).boxes)
    expect(a).toEqual(b)
  })
  it('brings boxes in beat by beat, and a box no step names comes in last', () => {
    const plan = sketchBeats(skNodes, [{ say: 'one', show: ['a', 'nope'] }, { say: 'two', show: ['b'] }])
    expect([...plan[0]!.visible]).toEqual(['a'])
    expect([...plan[1]!.visible].sort()).toEqual(['a', 'b', 'c'])
    expect(plan[1]!.newest).toEqual(['b', 'c'])
    expect(sketchBeats(skNodes, undefined).map((b) => b.newest[0])).toEqual(['a', 'b', 'c'])
  })
  it('draws the whole page on first paint and has a text version for a reader', () => {
    const html = renderToStaticMarkup(<Sketch title="why" nodes={skNodes} arrows={[{ from: 'a', to: 'b' }]} steps={[{ say: 'First the plan.', show: ['a'] }, { say: 'Then the hash.', show: ['b', 'c'] }]} />)
    expect(html).toContain('Plan')
    expect(html).toContain('Void')
    expect(html).not.toContain('ol-draw')
    expect(html).toContain('First the plan.')
    expect(html).toContain('ol-sr')
  })
  it('says nothing while loading, and a model-written Sketch is checked against its schema', async () => {
    expect(renderToStaticMarkup(<Sketch title="why" nodes={skNodes} arrows={[]} status="loading" />)).toContain('ol-skel')
    const { buildOrluneLibrary } = await import('../src/openui/index.js')
    const { Renderer } = await import('@openuidev/react-lang')
    const lib = buildOrluneLibrary({ kit: 'explain' })
    const good = 'root = Reply([Sketch("why", "Approve one plan", "tied by hash", [SketchNode("a", "Plan", 0, 0, "input"), SketchNode("b", "Hash", 1, 0)], [SketchArrow("a", "b", "bound to")], [SketchStep("Plan first.", ["a"]), SketchStep("Then hash.", ["b"])])])'
    const out = renderToStaticMarkup(<Renderer response={good} library={lib} isStreaming={false} />)
    expect(out).toContain('Approve one plan')
    const bad = 'root = Reply([Sketch("why", "x", "y", [SketchNode("a", "Plan", 0, 99)], [], [])])'
    expect(renderToStaticMarkup(<Renderer response={bad} library={lib} isStreaming={false} />)).not.toContain('ol-sketch')
  })
})

describe('Annotated', () => {
  it('anchors notes to rows by id, and leaves out a note whose target is missing', async () => {
    const events = [
      { seq: 1, type: 'launch', at: '2026-06-02T09:00:00Z', by: 'acme', hash: 'aa', signatureValid: true, chainValid: true },
      { seq: 2, type: 'retest', at: '2026-06-03T09:00:00Z', by: 'client', result: 'pass', hash: 'bb', signatureValid: false, chainValid: true },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Annotated annotations={[{ kind: 'sticky', target: 'event-2', text: 'Bad signature' }, { kind: 'sticky', target: 'event-99', text: 'Ghost' }, { kind: 'circle', target: 'event-1' }]}><LedgerTimeline events={events} /></Annotated>) })
    expect(host.querySelector('[data-annotate="event-2"]')).not.toBeNull()
    expect(host.querySelectorAll('.ol-ann-sticky')).toHaveLength(1)
    expect(host.querySelector('.ol-ann-sticky')!.textContent).toBe('Bad signature')
    expect(host.querySelectorAll('.ol-ann-circle')).toHaveLength(1)
    expect(host.textContent).toContain('Ghost')
    expect(host.querySelector('.ol-sr')).not.toBeNull()
  })
  it('brings notes in by step when played', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Annotated playable annotations={[{ kind: 'pin', at: { x: 0.5, y: 0.5 }, text: 'one' }, { kind: 'pin', at: { x: 0.2, y: 0.2 }, text: 'two', step: 1 }]}><div>content</div></Annotated>) })
    // The page lands whole; stepping back takes the later notes away, and forward brings them in again.
    expect(host.querySelectorAll('.ol-ann-chip')).toHaveLength(2)
    const press = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)!
    await act(async () => { press('Back').click() })
    expect(host.querySelectorAll('.ol-ann-chip')).toHaveLength(1)
    await act(async () => { press('Next').click() })
    expect(host.querySelectorAll('.ol-ann-chip')).toHaveLength(2)
  })
})

import { Tour } from '../src/index.js'
describe('Tour: any component, found by the words on screen', () => {
  const events = [
    { seq: 1, type: 'launch', at: '2026-06-02T09:00:00Z', by: 'northwind', label: 'Went live', hash: 'aa', signatureValid: true, chainValid: true },
    { seq: 2, type: 'retest', at: '2026-06-03T09:00:00Z', by: 'client', label: 'Weekly re-test', result: 'pass', hash: 'bb', signatureValid: false, chainValid: true },
  ]
  const mount = async (el: React.ReactElement) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(el) })
    return host
  }
  it('points at words it can find, leaves out words it cannot, and reads the line out', async () => {
    const host = await mount(<Tour steps={[
      { say: 'Look at the re-test.', target: 'text:Weekly re-test', kind: 'sticky', text: 'Signature failed' },
      { say: 'There is nothing to point at here.', target: 'text:no such words', kind: 'sticky', text: 'Ghost' },
    ]}><LedgerTimeline events={events} /></Tour>)
    expect(host.querySelectorAll('.ol-ann-sticky')).toHaveLength(1)
    expect(host.querySelector('.ol-ann-sticky')!.textContent).toBe('Signature failed')
    expect(host.querySelector('.ol-tour-say')!.textContent).toContain('Look at the re-test.')
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Next')!
    await act(async () => { next.click() })
    expect(host.querySelectorAll('.ol-ann-sticky')).toHaveLength(0)
    expect(host.querySelector('.ol-tour-say')!.textContent).toContain('nothing to point at')
  })
  it('does not point at hidden text', async () => {
    const host = await mount(<Tour steps={[{ say: 'x', target: 'text:Went live', text: 'seen' }]}><LedgerTimeline events={events} /></Tour>)
    expect(host.querySelectorAll('.ol-ann-chip, .ol-ann-sticky, .ol-ann-circle').length).toBeGreaterThan(0)
  })
  it('lets a model add a tour to a component it places, and a bad tour does not take the component down', async () => {
    const { buildOrluneLibrary } = await import('../src/openui/index.js')
    const { Renderer } = await import('@openuidev/react-lang')
    const lib = buildOrluneLibrary({ kit: 'workflow' })
    const prompt = lib.prompt()
    expect(prompt).toContain('TourStep')
    const withTour = 'root = Reply([Funnel("How many", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 30)], [TourStep("Most make it through.", "text:Signed", "circle", "start")])])'
    const html = renderToStaticMarkup(<Renderer response={withTour} library={lib} isStreaming={false} />)
    expect(html).toContain('75% kept')
    expect(html).toContain('ol-tour')
    const badTour = 'root = Reply([Funnel("How many", "deals", [FunnelStep("Signed", 40), FunnelStep("Set up", 30)], [TourStep("'+'x'.repeat(200)+'", "text:Signed")])])'
    const out = renderToStaticMarkup(<Renderer response={badTour} library={lib} isStreaming={false} />)
    expect(out).toContain('75% kept')
    expect(out).not.toContain('ol-tour')
  })
})
