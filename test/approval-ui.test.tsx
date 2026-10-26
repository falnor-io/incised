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
})
