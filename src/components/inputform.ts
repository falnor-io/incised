// Rules for a form an agent hands to a person. The point of each: what comes back is checked against the fields that
// were asked for, so an agent only ever receives values of the kind it asked for, and a missing answer is never filled in.

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'currency' | 'email' | 'url' | 'date'
export type Field = {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  default?: string | number | boolean
  help?: string
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  /** What to show for each option, when it differs from the value that is sent. */
  optionLabels?: Record<string, string>
}
export type FieldValue = string | number | boolean
export type Values = Record<string, FieldValue | undefined>

/** The starting value of each field: what was given, otherwise empty. A checkbox starts unchecked. */
export function initialValues(fields: Field[]): Values {
  return Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'checkbox' ? false : undefined)]))
}

const isHttpUrl = (t: string) => {
  try { const u = new URL(t); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false }
}
const blank = (v: FieldValue | undefined) => v === undefined || (typeof v === 'string' && v.trim() === '')

/** One message per field that is not acceptable. An empty result means the form can be sent. */
export function validateInput(fields: Field[], values: Values): Record<string, string> {
  const errors: Record<string, string> = {}
  const seen = new Set<string>()
  for (const f of fields) {
    if (seen.has(f.name)) { errors[f.name] = 'Two fields share this name.'; continue }
    seen.add(f.name)
    const v = values[f.name]
    if (f.type === 'checkbox') {
      if (f.required && v !== true) errors[f.name] = 'This has to be ticked.'
      continue
    }
    if (blank(v)) {
      if (f.required) errors[f.name] = 'Required.'
      continue
    }
    if (f.type === 'text' || f.type === 'textarea' || f.type === 'email' || f.type === 'url' || f.type === 'date') {
      const text = String(v).trim()
      if (f.minLength !== undefined && text.length < f.minLength) errors[f.name] = `At least ${f.minLength} characters.`
      else if (f.maxLength !== undefined && text.length > f.maxLength) errors[f.name] = `At most ${f.maxLength} characters.`
      else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[f.name] = 'Enter an email address.'
      else if (f.type === 'url' && !isHttpUrl(text)) errors[f.name] = 'Enter a web address starting with http:// or https://.'
      else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) errors[f.name] = 'Use the form 2026-06-10.'
      else if (f.type === 'date' && Number.isNaN(new Date(text + 'T00:00:00Z').getTime())) errors[f.name] = 'That is not a real date.'
    } else if (f.type === 'select') {
      if (!(f.options ?? []).includes(String(v))) errors[f.name] = 'Choose one of the options.'
    } else if (f.type === 'number' || f.type === 'currency') {
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isFinite(n)) errors[f.name] = 'Enter a number.'
      else if (f.type === 'currency' && n < 0) errors[f.name] = 'An amount cannot be negative.'
      else if (f.min !== undefined && n < f.min) errors[f.name] = `At least ${f.min}.`
      else if (f.max !== undefined && n > f.max) errors[f.name] = `At most ${f.max}.`
    }
  }
  return errors
}

/** The values to send: numbers as numbers, text trimmed, and blank optional fields left out. Throws on an invalid form. */
export function cleanValues(fields: Field[], values: Values): Record<string, FieldValue> {
  const errors = validateInput(fields, values)
  if (Object.keys(errors).length) throw new Error(`The form is not valid: ${Object.keys(errors).join(', ')}.`)
  const out: Record<string, FieldValue> = {}
  for (const f of fields) {
    const v = values[f.name]
    if (f.type === 'checkbox') out[f.name] = v === true
    else if (blank(v)) continue
    else if (f.type === 'number' || f.type === 'currency') out[f.name] = typeof v === 'number' ? v : Number(v)
    else out[f.name] = typeof v === 'string' ? v.trim() : v!
  }
  return out
}

/** Words that mean a field would collect a secret. MCP says a form must not, and a form is the wrong place for one. */
const SECRET = /(pass(word|wd|phrase)?|secret|api[\s_-]?key|access[\s_-]?token|auth[\s_-]?token|bearer|credential|private[\s_-]?key|card[\s_-]?number|cvv|cvc|\bssn\b|social security|\bpin\b)/i

export function looksSecret(f: Pick<Field, 'name' | 'label'>): boolean {
  return SECRET.test(f.name) || SECRET.test(f.label)
}

/** Fields a form may collect, and the ones it refuses because they look like secrets. */
export function splitSecretFields(fields: Field[]): { allowed: Field[]; refused: Field[] } {
  return { allowed: fields.filter((f) => !looksSecret(f)), refused: fields.filter(looksSecret) }
}

/** The three answers MCP allows to a request for input. */
export type ElicitationResult = { action: 'accept'; content: Record<string, FieldValue> } | { action: 'decline' } | { action: 'cancel' }

type SchemaProp = {
  type?: string
  title?: string
  description?: string
  format?: string
  default?: FieldValue
  enum?: string[]
  oneOf?: { const: string; title?: string }[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
}
export type FormSchema = { type?: string; properties?: Record<string, SchemaProp>; required?: string[] }

/**
 * Reads the restricted JSON Schema an MCP server sends with a request for input (flat properties: string, number,
 * integer, boolean, enum) into fields. A property it cannot show, such as a nested object or a list, is named in
 * `unsupported` and left out, never guessed at.
 */
export function fieldsFromJsonSchema(schema: FormSchema): { fields: Field[]; unsupported: string[] } {
  const fields: Field[] = []
  const unsupported: string[] = []
  const required = new Set(schema.required ?? [])
  for (const [name, p] of Object.entries(schema.properties ?? {})) {
    const base = { name, label: p.title ?? name, required: required.has(name), ...(p.description ? { help: p.description } : {}), ...(p.default !== undefined ? { default: p.default } : {}) }
    if (p.oneOf?.length && p.oneOf.every((o) => typeof o.const === 'string')) {
      fields.push({ ...base, type: 'select', options: p.oneOf.map((o) => o.const), optionLabels: Object.fromEntries(p.oneOf.map((o) => [o.const, o.title ?? o.const])) })
    } else if (p.enum && p.type === 'string') {
      fields.push({ ...base, type: 'select', options: p.enum })
    } else if (p.type === 'string') {
      const type: FieldType = p.format === 'email' ? 'email' : p.format === 'uri' ? 'url' : p.format === 'date' ? 'date' : 'text'
      if (p.format === 'date-time') unsupported.push(name)
      else fields.push({ ...base, type, ...(p.minLength !== undefined ? { minLength: p.minLength } : {}), ...(p.maxLength !== undefined ? { maxLength: p.maxLength } : {}) })
    } else if (p.type === 'number' || p.type === 'integer') {
      fields.push({ ...base, type: 'number', ...(p.minimum !== undefined ? { min: p.minimum } : {}), ...(p.maximum !== undefined ? { max: p.maximum } : {}) })
    } else if (p.type === 'boolean') {
      fields.push({ ...base, type: 'checkbox' })
    } else unsupported.push(name)
  }
  return { fields, unsupported }
}

/** Where a link would take a person, and whether to offer it at all. Only plain https links to a named host are offered. */
export function linkInfo(url: string): { ok: true; host: string; href: string } | { ok: false; reason: string } {
  let u: URL
  try { u = new URL(url) } catch { return { ok: false, reason: 'This is not a web address.' } }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Only https links are offered.' }
  if (u.username || u.password) return { ok: false, reason: 'This link has a name or password in it, which hides where it goes.' }
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return { ok: false, reason: 'This link goes to a number, not a named site.' }
  return { ok: true, host: u.hostname, href: u.href }
}
