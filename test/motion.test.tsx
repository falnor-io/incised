// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { Count, useCountUp } from '../src/index.js'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('motion on the existing components', () => {
  it('shows the final value on first paint, so server markup reads the same as the page', () => {
    expect(html(<Count value={86} suffix="%" />)).toBe('86%')
    expect(html(<Count value={12400} prefix="$" />)).toBe('$12,400')
    expect(html(<Count value={860.5} digits={2} prefix="$" />)).toBe('$860.5')
  })
  it('falls back to the raw value when the number is not finite', () => {
    expect(html(<Count value={Number.NaN} />)).toBe('NaN')
  })
  it('eases a change from the value on screen to the new one, and lands on it', async () => {
    let bump: (n: number) => void = () => {}
    function Probe() {
      const [n, set] = useState(10)
      bump = set
      return <span>{Math.round(useCountUp(n, 200))}</span>
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => { r.render(<Probe />) })
    expect(host.textContent).toBe('10')
    await act(async () => { bump(50) })
    // Sample as it moves: the value should pass through the middle on its way to the target.
    const seen: number[] = []
    for (let i = 0; i < 200; i++) {
      await act(async () => { await new Promise((res) => setTimeout(res, 20)) })
      seen.push(Number(host.textContent))
      if (seen[seen.length - 1] === 50) break
    }
    expect(seen.some((v) => v > 10 && v < 50)).toBe(true)
    expect(seen[seen.length - 1]).toBe(50)
    act(() => r.unmount()); host.remove()
  })
  it('jumps straight to the new value when reduced motion is asked for', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
    try {
      let bump: (n: number) => void = () => {}
      function Probe() {
        const [n, set] = useState(1)
        bump = set
        return <span>{Math.round(useCountUp(n, 5000))}</span>
      }
      const host = document.createElement('div')
      document.body.appendChild(host)
      const r = createRoot(host)
      await act(async () => { r.render(<Probe />) })
      await act(async () => { bump(77) })
      expect(host.textContent).toBe('77')
      act(() => r.unmount()); host.remove()
    } finally { window.matchMedia = original }
  })
})
