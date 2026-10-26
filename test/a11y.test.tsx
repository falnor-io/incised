// @vitest-environment jsdom
// Runs axe-core over the whole demo page (every component with its demo data). jsdom has no layout, so colour
// contrast is covered by the stylesheet lint instead; this catches names, roles, ARIA misuse and structure.
import { describe, expect, it } from 'vitest'
import axe from 'axe-core'

describe('accessibility (axe)', () => {
  it('the demo page has no violations', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('../demo/main.js')
    await new Promise((r) => setTimeout(r, 400))
    expect(document.querySelectorAll('section, article').length).toBeGreaterThan(10)
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    const summary = result.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(summary).toEqual([])
  })
})
