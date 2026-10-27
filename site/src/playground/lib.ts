// Pure helpers for the playground: which props get a control, how the editable JSON is read back, the code a person
// can copy, and the link that shares a state. No React and no DOM, so each rule can be tested on its own.

export type Props = Record<string, unknown>
export type ControlKind = 'string' | 'number' | 'boolean' | 'json'
export type Control = { key: string; kind: ControlKind; value: unknown }

/** One control per prop. Strings, numbers and booleans get an input. Anything else is edited as JSON. */
export function controlsFor(props: Props): Control[] {
  return Object.entries(props).map(([key, value]): Control => {
    const kind: ControlKind = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'json'
    return { key, kind, value }
  })
}

export type Parsed = { ok: true; value: Props } | { ok: false; error: string }

/** Reads the JSON a person typed. It must be an object, and the message says what is wrong instead of failing silently. */
export function parseProps(text: string): Parsed {
  if (text.trim() === '') return { ok: true, value: {} }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: (e as Error).message.replace(/^JSON\.parse: /, '') }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'The props must be an object, like { "title": "Run" }.' }
  return { ok: true, value: value as Props }
}

/** `props` with one key changed, leaving the original alone. */
export const withKey = (props: Props, key: string, value: unknown): Props => ({ ...props, [key]: value })

/** Only what differs from the defaults, so a shared link stays short. A key removed from the props is left out too. */
export function changedFrom(defaults: Props, current: Props): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(current)) if (JSON.stringify(v) !== JSON.stringify(defaults[k])) out[k] = v
  return out
}

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** The query string that reopens this state: the component and only the props that were changed. */
export function encodeShare(name: string, defaults: Props, current: Props): string {
  const q = new URLSearchParams({ c: name })
  const changed = changedFrom(defaults, current)
  if (Object.keys(changed).length > 0) q.set('p', toB64(JSON.stringify(changed)))
  return q.toString()
}

/** Reads a shared state back. Anything it cannot read is ignored, so a broken link opens the default state. */
export function decodeShare(search: string): { name?: string; props?: Props } {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const name = q.get('c') ?? undefined
  const raw = q.get('p')
  if (!raw) return { name }
  try {
    const parsed = parseProps(fromB64(raw))
    return parsed.ok ? { name, props: parsed.value } : { name }
  } catch {
    return { name }
  }
}

const VALID_ATTR = /^[A-Za-z_][\w:-]*$/
const plainString = (s: string) => !/["\\{}<>\n\r]/.test(s)

const indent = (text: string, by: string) => text.split('\n').map((l, i) => (i === 0 ? l : by + l)).join('\n')

/** The JSX a person can paste: an import, then the component with each prop written the way they would write it by hand. */
export function codeFor(name: string, props: Props, events: string[] = []): string {
  const attrs: string[] = []
  const spread: Props = {}
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue
    if (!VALID_ATTR.test(k)) { spread[k] = v; continue }
    if (typeof v === 'string') attrs.push(plainString(v) ? `${k}="${v}"` : `${k}={${JSON.stringify(v)}}`)
    else if (v === true) attrs.push(k)
    else if (typeof v === 'object' && v !== null) attrs.push(`${k}={${JSON.stringify(v, null, 2)}}`)
    else attrs.push(`${k}={${JSON.stringify(v)}}`)
  }
  if (Object.keys(spread).length > 0) attrs.push(`{...${JSON.stringify(spread, null, 2)}}`)
  for (const e of events) attrs.push(`${e}={(...args) => console.log('${e}', ...args)}`)
  const imports = `import { ${name} } from 'orlune'\nimport 'orlune/styles.css'\n\n`
  const oneLine = `<${name}${attrs.map((a) => ` ${a}`).join('')} />`
  if (attrs.length === 0) return `${imports}<${name} />`
  if (oneLine.length <= 80 && !oneLine.includes('\n')) return imports + oneLine
  return `${imports}<${name}\n${attrs.map((a) => `  ${indent(a, '  ')}`).join('\n')}\n/>`
}

/** A value for the events log: short, and never throws on something that cannot be turned into JSON. */
export function brief(value: unknown, max = 160): string {
  let text: string
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value))
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const kebab = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
