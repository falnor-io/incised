import { describe, expect, it } from 'vitest'
import { brief, changedFrom, codeFor, controlsFor, decodeShare, encodeShare, kebab, parseProps, withKey } from '../site/src/playground/lib.js'

describe('playground: controls and the JSON editor', () => {
  it('gives a control to each prop, and an input only to strings, numbers and booleans', () => {
    expect(controlsFor({ title: 'Run', limit: 5, on: true, steps: [1], rule: { a: 1 }, none: null }).map((c) => [c.key, c.kind])).toEqual([
      ['title', 'string'], ['limit', 'number'], ['on', 'boolean'], ['steps', 'json'], ['rule', 'json'], ['none', 'json'],
    ])
  })
  it('reads an object and treats an empty box as no props', () => {
    expect(parseProps('{ "a": 1 }')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseProps('   ')).toEqual({ ok: true, value: {} })
  })
  it('says what is wrong instead of failing silently', () => {
    const bad = parseProps('{ "a": ')
    expect(bad.ok).toBe(false)
    expect(parseProps('[1, 2]')).toEqual({ ok: false, error: 'The props must be an object, like { "title": "Run" }.' })
    expect(parseProps('"text"').ok).toBe(false)
    expect(parseProps('null').ok).toBe(false)
  })
  it('changes one key and leaves the original alone', () => {
    const a = { x: 1, y: 2 }
    expect(withKey(a, 'x', 9)).toEqual({ x: 9, y: 2 })
    expect(a).toEqual({ x: 1, y: 2 })
  })
})

describe('playground: sharing a state', () => {
  const defaults = { title: 'Run', steps: [1, 2, 3], limit: 5 }
  it('keeps only what was changed', () => {
    expect(changedFrom(defaults, { ...defaults, limit: 9 })).toEqual({ limit: 9 })
    expect(changedFrom(defaults, { ...defaults, steps: [1, 2] })).toEqual({ steps: [1, 2] })
    expect(changedFrom(defaults, defaults)).toEqual({})
  })
  it('round-trips a state through a link, including text that is not ASCII', () => {
    const current = { ...defaults, title: 'Réunion, 日本語 and "quotes"', limit: 9 }
    const link = encodeShare('Funnel', defaults, current)
    expect(link).toMatch(/^c=Funnel&p=[A-Za-z0-9_-]+$/)
    expect(decodeShare(link)).toEqual({ name: 'Funnel', props: { title: 'Réunion, 日本語 and "quotes"', limit: 9 } })
  })
  it('leaves the props out of the link when nothing changed', () => {
    expect(encodeShare('Funnel', defaults, defaults)).toBe('c=Funnel')
    expect(decodeShare('?c=Funnel')).toEqual({ name: 'Funnel' })
  })
  it('opens the default state from a link it cannot read', () => {
    expect(decodeShare('?c=Funnel&p=%%%not-base64')).toEqual({ name: 'Funnel' })
    expect(decodeShare('?c=Funnel&p=AAAA')).toEqual({ name: 'Funnel' })
    expect(decodeShare('')).toEqual({ name: undefined })
  })
})

describe('playground: the code to copy', () => {
  it('writes each prop the way a person would', () => {
    const code = codeFor('Funnel', { title: 'How many', unit: 'deals', autoplay: true, off: false, limit: 5 })
    expect(code).toBe("import { Funnel } from 'orlune'\nimport 'orlune/styles.css'\n\n<Funnel title=\"How many\" unit=\"deals\" autoplay off={false} limit={5} />")
  })
  it('puts objects and arrays in braces, one prop to a line once it is long', () => {
    const code = codeFor('Funnel', { title: 'How many make it through', steps: [{ label: 'Signed', value: 40 }, { label: 'Set up', value: 31 }] })
    expect(code).toContain('<Funnel\n  title="How many make it through"\n  steps={[')
    expect(code).toContain('    {\n      "label": "Signed"')
    expect(code.trimEnd().endsWith('/>')).toBe(true)
  })
  it('uses braces for a string that cannot sit in quotes', () => {
    expect(codeFor('Trail', { request: 'say "hi"' })).toContain('request={"say \\"hi\\""}')
    expect(codeFor('Trail', { request: 'a\nb' })).toContain('request={"a\\nb"}')
  })
  it('spreads a key that is not a valid attribute name', () => {
    const code = codeFor('Funnel', { 'a b': 1, title: 'T' })
    expect(code).toContain('title="T"')
    expect(code).toContain('{...{')
    expect(code).toContain('"a b": 1')
  })
  it('adds a logging handler for each event, and writes a bare tag when there are no props', () => {
    expect(codeFor('ApprovalQueue', { title: 'T' }, ['onDecide'])).toContain("onDecide={(...args) => console.log('onDecide', ...args)}")
    expect(codeFor('Funnel', {})).toBe("import { Funnel } from 'orlune'\nimport 'orlune/styles.css'\n\n<Funnel />")
  })
  it('skips undefined props', () => {
    expect(codeFor('Funnel', { a: undefined, title: 'T' })).not.toContain('a=')
  })
})

describe('playground: small helpers', () => {
  it('shortens a long value for the events log, and survives one that cannot be turned into JSON', () => {
    expect(brief('x'.repeat(300), 20)).toHaveLength(20)
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => brief(loop)).not.toThrow()
    expect(brief(undefined)).toBe('undefined')
    expect(brief({ a: 1 })).toBe('{"a":1}')
  })
  it('makes the docs page name from a component name', () => {
    expect(kebab('ApprovalWorkspace')).toBe('approval-workspace')
    expect(kebab('Funnel')).toBe('funnel')
  })
})
