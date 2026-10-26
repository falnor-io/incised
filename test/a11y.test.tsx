// @vitest-environment jsdom
// Runs axe-core over the whole demo page (every component with its demo data). jsdom has no layout, so colour
// contrast is covered by the stylesheet lint instead; this catches names, roles, ARIA misuse and structure.
import { describe, expect, it, vi } from 'vitest'
import axe from 'axe-core'

// The demo mounts itself on import. Keep hold of its root so the test can unmount it, otherwise a timer or promise
// in a component can fire after the test environment is gone and fail an unrelated run.
vi.mock('react-dom/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-dom/client')>()
  return { ...real, createRoot: (...args: Parameters<typeof real.createRoot>) => ((globalThis as { __demoRoot?: unknown }).__demoRoot = real.createRoot(...args)) }
})

describe('accessibility (axe)', () => {
  it('the demo page has no violations', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('../demo/main.js')
    await new Promise((r) => setTimeout(r, 400))
    expect(document.querySelectorAll('section, article').length).toBeGreaterThan(10)
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    const summary = result.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    ;(globalThis as { __demoRoot?: { unmount(): void } }).__demoRoot?.unmount()
    await new Promise((r) => setTimeout(r, 100))
    expect(summary).toEqual([])
  })
})
