// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { Trail } from '../src/index.js'

const stops = [
  { name: 'Intake', owner: 'ops', note: 'in', waitDays: 1 },
  { name: 'Review', owner: 'legal', note: 'check', waitDays: 3 },
  { name: 'Sign', owner: 'cfo', note: 'ok', waitDays: 0 },
]

describe('playable Trail', () => {
  it('renders the same static markup without playable', () => {
    const out = renderToStaticMarkup(<Trail title="t" request="r" stops={stops} />)
    expect(out).toContain('waits 4 days across 3 stops')
    expect(out).not.toContain('ol-playbar')
  })
  it('counts the wait so far and steps with Next', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Trail title="t" request="r" stops={stops} playable />) })
    expect(host.textContent).toContain('1 of 4 days waited at stop 1')
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Next')!
    await act(async () => { next.click() })
    expect(host.textContent).toContain('4 of 4 days waited at stop 2')
    expect(host.querySelectorAll('[data-ahead="true"]').length).toBe(1)
  })
})

describe('shared playback', () => {
  it('draws a share card with escaped text and a tone', async () => {
    const { shareCardSvg } = await import('../src/index.js')
    const svg = shareCardSvg({ title: 'A & B', verdict: 'Tampered', tone: 'bad', figures: [{ label: 'events', value: '12' }] })
    expect(svg).toContain('A &amp; B')
    expect(svg).toContain('#b3261e')
    expect(svg.startsWith('<svg')).toBe(true)
  })
  it('opens on the step in the address and keeps it current', async () => {
    window.history.replaceState(null, '', '/?step=2')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Trail title="t" request="r" stops={stops} playable param="step" />) })
    expect(host.textContent).toContain('4 of 4 days waited at stop 2')
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Next')!
    await act(async () => { next.click() })
    expect(window.location.search).toBe('?step=3')
  })
  it('Funnel and the ledger-style lists dim steps ahead of the playhead', async () => {
    const { Funnel } = await import('../src/index.js')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Funnel title="f" unit="cases" playable steps={[{ label: 'a', value: 10 }, { label: 'b', value: 5 }, { label: 'c', value: 1 }]} />) })
    expect(host.querySelectorAll('[data-ahead="true"]').length).toBe(2)
    expect(host.textContent).toContain('100% still in at step 1')
  })
  it('Ask draws the record the resolver names, and says so when none fits', async () => {
    const { Ask, SourcesProvider } = await import('../src/index.js')
    const sources = { plans: { p1: { plan: [{ id: 'a', name: 'Read' }], actual: [{ id: 'a', name: 'Read', status: 'ok' }] } } }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<SourcesProvider sources={sources as never}><Ask resolve={async (q) => (q === 'plan' ? { kind: 'plans', source: 'p1', title: 'Plan' } : null)} /></SourcesProvider>) })
    const input = host.querySelector('input')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(input, 'nothing'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(host.textContent).toContain('None of the records answer that.')
  })
})

describe('status, actions, live sources, exports', () => {
  it('draws a skeleton while loading, an alert on error, and a note while partial', () => {
    const { Funnel } = require_funnel()
    const steps = [{ label: 'a', value: 10 }, { label: 'b', value: 5 }]
    const loading = renderToStaticMarkup(<Funnel title="f" unit="x" steps={steps} status="loading" />)
    expect(loading).toContain('aria-busy="true"')
    expect(loading).toContain('ol-skel')
    expect(loading).not.toContain('ol-funnel')
    expect(renderToStaticMarkup(<Funnel title="f" unit="x" steps={steps} status="error" />)).toContain('role="alert"')
    const partial = renderToStaticMarkup(<Funnel title="f" unit="x" steps={steps} status="partial" />)
    expect(partial).toContain('More is on the way')
    expect(partial).toContain('ol-funnel')
    expect(renderToStaticMarkup(<Funnel title="f" unit="x" steps={steps} />)).not.toContain('More is on the way')
  })
  it('turns a decision and an answer into one action, and hands it to the AI SDK or an MCP App', async () => {
    const m = await import('../src/index.js')
    const a = m.decisionAction('inv-1', 'approve', 'abc123', 'ok')
    expect(a).toEqual({ name: 'decision', context: { id: 'inv-1', decision: 'approve', planHash: 'abc123', message: 'ok' } })
    expect(m.toToolOutput(a)).toMatchObject({ action: 'decision', planHash: 'abc123' })
    expect(m.toModelContext(a).content[0]!.text).toContain('abc123')
    expect(m.inputAction({ action: 'decline' })).toEqual({ name: 'input', context: { action: 'decline' } })
  })
  it('redraws a Drawing when a record arrives in the store', async () => {
    const { Drawing, SourcesProvider, createSourceStore } = await import('../src/index.js')
    const store = createSourceStore()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<SourcesProvider store={store}><Drawing kind="chains" source="p" title="Pay" status="loading" /></SourcesProvider>) })
    expect(host.querySelector('.ol-skel')).not.toBeNull()
    await act(async () => { store.set('chains', 'p', { requester: 'agent', startedAt: '2026-06-10T08:00:00Z', steps: [{ id: 's1', role: 'Review', who: 'a' }], decisions: [], now: '2026-06-10T09:00:00Z' } as never) })
    expect(host.querySelector('.ol-skel')).toBeNull()
    expect(host.textContent).toContain('Review')
  })
  it('exports a card as email HTML and plain text, and writes a record card only from the verifier result', async () => {
    const m = await import('../src/index.js')
    const card = m.recordCard({ ok: false, engagement: 'Acme <run>', ledger: { events: 4, intact: false }, guarantees: [{ status: 'honored' }, { status: 'breached' }], verifiedAt: '2026-06-10' })
    expect(card.verdict).toBe('Not verified')
    expect(card.figures.find((f) => f.label === 'guarantees met')!.value).toBe('1 of 2')
    const html = m.shareCardHtml(card)
    expect(html).toContain('Acme &lt;run&gt;')
    expect(html).not.toContain('<script')
    expect(m.shareCardText(card)).toContain('ledger: broken')
  })
  it('lists what a model may place and builds an MCP App tool', async () => {
    const m = await import('../src/index.js')
    expect(m.orluneCatalog({ chains: { a: {} as never }, flows: {} })).toEqual([{ name: 'ApprovalChain', source: 'chains', props: { source: 'string', title: 'string' }, ids: ['a'] }])
    expect(m.mcpAppTool({ name: 'show', description: 'd', inputSchema: {}, resourceUri: 'ui://orlune/chain' })._meta).toEqual({ ui: { resourceUri: 'ui://orlune/chain' } })
  })
})

import { Funnel as FunnelC } from '../src/index.js'
function require_funnel() { return { Funnel: FunnelC } }

describe('A2UI and AI SDK adapters', () => {
  it('writes the A2UI v0.9 action message documented by the A2UI actions guide', async () => {
    const { decisionAction, toA2uiAction } = await import('../src/index.js')
    const m = toA2uiAction(decisionAction('q1', 'approve', 'abc'), { surfaceId: 'booking-surface', sourceComponentId: 'approve-btn', at: new Date('2026-02-25T10:40:00Z') })
    expect(m).toEqual({ version: 'v0.9', action: { name: 'decision', surfaceId: 'booking-surface', sourceComponentId: 'approve-btn', timestamp: '2026-02-25T10:40:00.000Z', context: { id: 'q1', decision: 'approve', planHash: 'abc' } } })
  })
  it('maps AI SDK tool-part states to a component status', async () => {
    const { statusOfToolPart } = await import('../src/index.js')
    expect(statusOfToolPart('input-streaming')).toBe('partial')
    expect(statusOfToolPart('input-available')).toBe('loading')
    expect(statusOfToolPart('output-available')).toBe('ready')
    expect(statusOfToolPart('approval-requested')).toBe('awaiting')
    expect(statusOfToolPart('approval-responded')).toBe('ready')
    expect(statusOfToolPart('output-denied')).toBe('error')
    expect(statusOfToolPart('output-error')).toBe('error')
  })
})
