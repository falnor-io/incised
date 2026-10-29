// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApprovalQueue, InputRequest, type QueueItem } from '../src/index.js'
import { planDigest } from '../src/components/approval.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item = (o: Partial<QueueItem> = {}): QueueItem => ({
  id: 'q1', action: 'Send email', summary: 'Email the vendor.', requester: 'agent', risk: 'medium', plan: { tool: 'send_email', args: { subject: 'Hi' } },
  evidence: [], reversible: false, needs: 1, decisions: [], allowed: ['approve', 'reject', 'respond'], editable: true, ...o,
})

let root: Root | null = null
let host: HTMLDivElement | null = null
beforeAll(() => { vi.stubGlobal('scrollTo', () => {}) })
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

async function mount(el: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root!.render(el) })
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  return host
}
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (h: HTMLElement, text: RegExp) => [...h.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''))!

describe('ApprovalQueue reply, reason and edit', () => {
  it('asks for words before a reply and sends them with it', async () => {
    const onDecide = vi.fn()
    const h = await mount(<ApprovalQueue title="q" items={[item()]} reviewer="raj" now="2026-06-10T12:00:00Z" onDecide={onDecide} />)
    await click(button(h, /Reply without running/))
    expect(onDecide).not.toHaveBeenCalled()
    expect(h.textContent).toMatch(/Write the reply first/)
    await type(h.querySelector('textarea')!, 'Use a softer tone.')
    await click(button(h, /Reply without running/))
    expect(onDecide).toHaveBeenCalledWith('q1', 'respond', expect.any(String), 'Use a softer tone.')
    expect(h.textContent).toMatch(/Answered, nothing ran/)
  })
  it('sends the reason with a rejection', async () => {
    const onDecide = vi.fn()
    const h = await mount(<ApprovalQueue title="q" items={[item()]} reviewer="raj" now="2026-06-10T12:00:00Z" onDecide={onDecide} />)
    await type(h.querySelector('textarea')!, 'wrong vendor')
    await click(button(h, /^Reject/))
    expect(onDecide).toHaveBeenCalledWith('q1', 'reject', expect.any(String), 'wrong vendor')
  })
  it('hides buttons the item does not allow', async () => {
    const h = await mount(<ApprovalQueue title="q" items={[item({ allowed: ['approve'], editable: false })]} reviewer="raj" now="2026-06-10T12:00:00Z" />)
    expect(button(h, /^Reject/)).toBeUndefined()
    expect(button(h, /Reply without running/)).toBeUndefined()
    expect(button(h, /Edit the plan/)).toBeUndefined()
  })
  it('rejects invalid JSON and an unchanged plan, and reports a real edit', async () => {
    const onEdit = vi.fn()
    const h = await mount(<ApprovalQueue title="q" items={[item()]} reviewer="raj" now="2026-06-10T12:00:00Z" onEdit={onEdit} />)
    await click(button(h, /Edit the plan/))
    const ta = () => h.querySelector('textarea')!
    await type(ta(), '{ not json')
    await click(button(h, /Save the edited plan/))
    expect(h.textContent).toMatch(/not valid JSON/)
    expect(onEdit).not.toHaveBeenCalled()
    await type(ta(), JSON.stringify({ tool: 'send_email', args: { subject: 'Hi' } }))
    await click(button(h, /Save the edited plan/))
    expect(h.textContent).toMatch(/Nothing changed/)
    await type(ta(), JSON.stringify({ tool: 'send_email', args: { subject: 'Softer' } }))
    await click(button(h, /Save the edited plan/))
    expect(onEdit).toHaveBeenCalledWith('q1', { tool: 'send_email', args: { subject: 'Softer' } })
    expect(h.querySelector('textarea[id$="-plan"]')).toBeNull()
  })
  it('makes an earlier approval stop counting once the plan is edited', async () => {
    const plan = { tool: 'send_email', args: { subject: 'Hi' } }
    const hash = await planDigest(plan)
    const prior = { by: 'kim', decision: 'approve' as const, at: '2026-06-10T10:00:00Z', planHash: hash }
    const h = await mount(<ApprovalQueue title="q" items={[item({ needs: 2, decisions: [prior] })]} reviewer="raj" now="2026-06-10T12:00:00Z" />)
    expect(h.textContent).toMatch(/Approvals 1 of 2/)
    await click(button(h, /Edit the plan/))
    await type(h.querySelector('textarea[id$="-plan"]') as HTMLTextAreaElement, JSON.stringify({ tool: 'send_email', args: { subject: 'Softer' } }))
    await click(button(h, /Save the edited plan/))
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    expect(h.textContent).toMatch(/Approvals 0 of 2/)
    expect(h.textContent).toMatch(/Plan changed/)
    expect(h.textContent).toMatch(/does not count/)
  })
})

describe('InputRequest', () => {
  const fields = [
    { name: 'amount', label: 'Amount', type: 'currency' as const, required: true, min: 1 },
    { name: 'pay', label: 'Payment', type: 'select' as const, required: true, options: ['a', 'b'] },
    { name: 'notify', label: 'Tell the vendor', type: 'checkbox' as const, default: true },
  ]
  const set = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
  }
  it('names what is wrong and sends nothing until it is right', async () => {
    const onSubmit = vi.fn()
    const h = await mount(<InputRequest title="Refund" fields={fields} onSubmit={onSubmit} />)
    await click(button(h, /Send to the agent/))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(h.textContent).toMatch(/2 answers need fixing/)
    expect(h.querySelector('[aria-invalid="true"]')).not.toBeNull()
    await set(h.querySelector('input[name="amount"]') as HTMLInputElement, '12.5')
    await set(h.querySelector('select[name="pay"]') as HTMLSelectElement, 'b')
    await click(button(h, /Send to the agent/))
    expect(onSubmit).toHaveBeenCalledWith({ amount: 12.5, pay: 'b', notify: true })
    expect(h.textContent).toMatch(/Sent/)
  })
  it('says so when the agent asked for nothing', async () => {
    const h = await mount(<InputRequest title="Refund" fields={[]} />)
    expect(h.textContent).toMatch(/did not say what it needs/)
  })
  it('leaves out a field that looks like a secret and says so', async () => {
    const h = await mount(<InputRequest title="Connect" fields={[{ name: 'user', label: 'Username', type: 'text' }, { name: 'pw', label: 'Password', type: 'text', required: true }]} />)
    expect(h.querySelector('input[name="pw"]')).toBeNull()
    expect(h.querySelector('input[name="user"]')).not.toBeNull()
    expect(h.textContent).toMatch(/does not collect passwords, keys or card details/)
  })
  it('offers a safe link with the site named, and withholds an unsafe one', async () => {
    const good = await mount(<InputRequest title="Connect" fields={[]} link={{ url: 'https://auth.example.com/go', label: 'Sign in' }} />)
    const a = good.querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://auth.example.com/go')
    expect(a.getAttribute('rel')).toMatch(/noopener/)
    expect(a.textContent).toContain('auth.example.com')
    act(() => root?.unmount()); good.remove()
    const bad = await mount(<InputRequest title="Connect" fields={[]} link={{ url: 'https://good.com@evil.example/' }} />)
    expect(bad.querySelector('a')).toBeNull()
    expect(bad.textContent).toMatch(/link was not offered/)
  })
  it('answers in the three shapes MCP uses', async () => {
    const onResult = vi.fn()
    const h = await mount(<InputRequest title="Q" from="billing-server" fields={[{ name: 'n', label: 'Name', type: 'text', required: true }]} onResult={onResult} onDecline={() => {}} onCancel={() => {}} />)
    expect(h.textContent).toMatch(/Asked by billing-server/)
    await click(button(h, /Decline to answer/))
    expect(onResult).toHaveBeenLastCalledWith({ action: 'decline' })
    await click(button(h, /Not now/))
    expect(onResult).toHaveBeenLastCalledWith({ action: 'cancel' })
  })
  it('accepts with the checked values', async () => {
    const onResult = vi.fn()
    const h = await mount(<InputRequest title="Q" fields={[{ name: 'n', label: 'Name', type: 'text', required: true }]} onResult={onResult} />)
    await set(h.querySelector('input[name="n"]') as HTMLInputElement, '  Sam ')
    await click(button(h, /Send to the agent/))
    expect(onResult).toHaveBeenCalledWith({ action: 'accept', content: { n: 'Sam' } })
  })
})

import { DiffViewer } from '../src/index.js'

describe('DiffViewer: moved code, authorship and hunk decisions', () => {
  const block = ['  - name: duplicate-check', '    when: invoice.number in recent_invoices', '    then: hold_for_review']
  const files = [
    { path: 'a.yaml', before: ['top', ...block, 'limit: 5000'].join('\n'), after: ['top', 'limit: 2500'].join('\n') },
    { path: 'b.yaml', before: 'checks:', after: ['checks:', ...block].join('\n'), authors: [{ from: 2, to: 4, by: 'invoice-agent', kind: 'agent' as const }] },
  ]
  it('marks moved lines, leaves them out of the counts and says how many', async () => {
    const h = await mount(<DiffViewer title="d" files={files} />)
    expect(h.textContent).toMatch(/3 moved, not rewritten/)
    expect(h.querySelectorAll('td.ol-code[data-moved="true"]').length).toBe(6)
    expect(h.textContent).not.toMatch(/No differences/)
    expect(h.textContent).toMatch(/\+1/)
  })
  it('shows who wrote the added lines', async () => {
    const h = await mount(<DiffViewer title="d" files={files} />)
    expect(h.querySelectorAll('td.ol-ln[data-author="agent"]').length).toBeGreaterThan(0)
    expect(h.textContent).toMatch(/100% agent/)
  })
  it('lists the file with the most real change first when asked', async () => {
    const h = await mount(<DiffViewer title="d" files={files} order="salience" />)
    const names = [...h.querySelectorAll('.ol-file-head b:not(.ol-add):not(.ol-del)')].map((b) => b.textContent)
    expect(names[0]).toBe('a.yaml')
  })
  it('reports each hunk decision with a digest of the file, and the digest changes when the file does', async () => {
    const onDecideHunk = vi.fn()
    const h = await mount(<DiffViewer title="d" files={files} onDecideHunk={onDecideHunk} />)
    await click(button(h, /^Accept$/))
    expect(onDecideHunk).toHaveBeenCalledWith('a.yaml', expect.any(Number), 'accept', expect.stringMatching(/^[0-9a-f]{12}$/))
    const first = onDecideHunk.mock.calls[0]![3]
    act(() => root?.unmount()); h.remove()
    const edited = await mount(<DiffViewer title="d" files={[{ ...files[0]!, after: files[0]!.after + '\nextra: 1' }, files[1]!]} onDecideHunk={onDecideHunk} />)
    await click(button(edited, /^Accept$/))
    expect(onDecideHunk.mock.calls[1]![3]).not.toBe(first)
  })
  it('does nothing with hunks when no handler is given', async () => {
    const h = await mount(<DiffViewer title="d" files={files} />)
    expect(button(h, /^Accept$/)).toBeUndefined()
  })
})

import { FlowCanvas } from '../src/index.js'

describe('FlowCanvas keys and outline', () => {
  const nodes = [
    { id: 'a', label: 'Invoice in', kind: 'start' as const },
    { id: 'b', label: 'Match the PO', kind: 'step' as const },
    { id: 'c', label: 'Release payment', kind: 'end' as const },
  ]
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Matched' }]
  const key = async (el: Element, k: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }) }
  const pressed = (h: HTMLElement) => h.querySelector('button[data-node][aria-pressed="true"]')?.getAttribute('data-node-id')
  beforeAll(() => { (globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s } })

  it('walks along the edges with the arrow keys once a step is selected', async () => {
    const h = await mount(<FlowCanvas title="f" nodes={nodes} edges={edges} />)
    await click(h.querySelector('button[data-node-id="a"]')!)
    expect(pressed(h)).toBe('a')
    const canvas = h.querySelector('.ol-canvas')!
    await key(canvas, 'ArrowRight')
    expect(pressed(h)).toBe('b')
    await key(canvas, 'ArrowRight')
    expect(pressed(h)).toBe('c')
    await key(canvas, 'ArrowLeft')
    expect(pressed(h)).toBe('b')
  })
  it('pans instead when nothing is selected, or when there is nowhere to walk', async () => {
    const h = await mount(<FlowCanvas title="f" nodes={nodes} edges={edges} />)
    const canvas = h.querySelector('.ol-canvas')!
    await key(canvas, 'ArrowRight')
    expect(pressed(h)).toBeUndefined()
    await click(h.querySelector('button[data-node-id="c"]')!)
    await key(canvas, 'ArrowRight')
    expect(pressed(h)).toBe('c')
  })
  it('lists the same diagram as an outline that selects a step', async () => {
    const h = await mount(<FlowCanvas title="f" nodes={nodes} edges={edges} />)
    expect(h.querySelector('details.ol-outline summary')!.textContent).toMatch(/Outline/)
    const items = [...h.querySelectorAll('.ol-outlinelist button')].map((b) => b.textContent)
    expect(items).toEqual(['Invoice in', 'Match the PO', 'Matched: Release payment'])
    await click(h.querySelectorAll('.ol-outlinelist button')[1]!)
    expect(pressed(h)).toBe('b')
  })
})

import { RunTheatre, SealedRecord } from '../src/index.js'

describe('RunTheatre and SealedRecord', () => {
  const stages = [
    { id: 'a', title: 'Read the invoice', detail: 'Read every line of the invoice.', inputs: ['Invoice PDF'], result: 'Six lines', minutes: 2 },
    { id: 'b', title: 'Match the order', detail: 'Match each line to the order.', minutes: 5, focus: { x: 0.6, y: 0.4, label: '$12,400' } },
    { id: 'c', title: 'Release', detail: 'Release the payment.', minutes: 3 },
  ]
  const key = async (el: Element, k: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }) }
  const step = (h: HTMLElement) => h.querySelector('.ol-pill')?.textContent

  it('plays the first step, shows the time left, and shows the loupe on a step that has a focus', async () => {
    const h = await mount(<RunTheatre title="Run" stages={stages} />)
    expect(step(h)).toBe('Step 1 of 3')
    expect(h.textContent).toMatch(/10m left/)
    expect(h.textContent).toMatch(/Invoice PDF/)
    await click(button(h, /^Next$/))
    expect(h.querySelector('.ol-loupe b')?.textContent).toBe('$12,400')
  })
  it('moves with the arrow keys and the step pips, and stops at the ends', async () => {
    const h = await mount(<RunTheatre title="Run" stages={stages} />)
    const bar = h.querySelector('[role="toolbar"]')!
    await key(bar, 'ArrowRight')
    await key(bar, 'ArrowRight')
    expect(step(h)).toBe('Step 3 of 3')
    expect(h.textContent).toMatch(/Done/)
    await key(bar, 'ArrowRight')
    expect(step(h)).toBe('Step 3 of 3')
    await click(h.querySelector('button.ol-pip')!)
    expect(step(h)).toBe('Step 1 of 3')
  })
  it('shows the finish in place of the last step', async () => {
    const h = await mount(<RunTheatre title="Run" stages={stages} finish={<p>Sealed in the record.</p>} />)
    await click(h.querySelectorAll('button.ol-pip')[2]!)
    expect(h.textContent).toMatch(/Sealed in the record/)
    expect(h.querySelector('.ol-stagepanel')).toBeNull()
  })
  // Fake timers stop the real-timer wait in mount(), so these render synchronously and advance time by hand.
  const mountSync = (el: React.ReactElement) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    act(() => { r.render(el) })
    return { host, unmount: () => { act(() => r.unmount()); host.remove() } }
  }
  it('does not move on its own unless asked to', () => {
    vi.useFakeTimers()
    const { host, unmount } = mountSync(<RunTheatre title="Run" stages={stages} intervalMs={1000} />)
    try {
      act(() => { vi.advanceTimersByTime(5000) })
      expect(step(host)).toBe('Step 1 of 3')
    } finally { unmount(); vi.useRealTimers() }
  })
  it('plays forward on its own when autoplay is set, then stops at the end', () => {
    vi.useFakeTimers()
    const { host, unmount } = mountSync(<RunTheatre title="Run" stages={stages} autoplay intervalMs={1000} />)
    try {
      act(() => { vi.advanceTimersByTime(1100) })
      expect(step(host)).toBe('Step 2 of 3')
      act(() => { vi.advanceTimersByTime(5000) })
      expect(step(host)).toBe('Step 3 of 3')
      expect(host.querySelector('button[aria-pressed]')!.getAttribute('aria-pressed')).toBe('false')
    } finally { unmount(); vi.useRealTimers() }
  })
  it('says so for a run with no steps', async () => {
    const h = await mount(<RunTheatre title="Run" stages={[]} />)
    expect(h.textContent).toMatch(/No steps to play/)
  })
  it('seals a record with its final figures in the markup, whatever the animation is doing', async () => {
    const h = await mount(<SealedRecord title="Record sealed" sealedText="Sealed by the controller." stats={[{ label: 'Time', value: 10, suffix: 'min' }, { label: 'Steps', value: 3 }]} animate={false} onSave={() => {}} />)
    expect(h.querySelector('dd[aria-label="10 min"]')!.textContent).toMatch(/10/)
    expect(h.querySelector('dd[aria-label="3"]')!.textContent).toMatch(/3/)
    expect(button(h, /Save to your record/)).toBeDefined()
  })
  it('counts up from zero when animated, and reaches the final figure', async () => {
    const h = await mount(<SealedRecord title="Record" sealedText="Sealed." stats={[{ label: 'Steps', value: 9 }]} />)
    // Wait for the figure rather than for a fixed time: the animation frames run late when the whole suite is busy.
    for (let i = 0; i < 160 && h.querySelector('.ol-sealnum')!.textContent !== '9'; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(h.querySelector('.ol-sealnum')!.textContent).toBe('9')
  }, 15_000)
})
