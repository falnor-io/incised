// Rules for a form an agent hands to a person. The point of each: what comes back is checked against the fields that
// were asked for, so an agent only ever receives values of the kind it asked for, and a missing answer is never filled in.

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'currency'
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
}
export type FieldValue = string | number | boolean
export type Values = Record<string, FieldValue | undefined>

/** The starting value of each field: what was given, otherwise empty. A checkbox starts unchecked. */
export function initialValues(fields: Field[]): Values {
  return Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'checkbox' ? false : undefined)]))
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
    if (f.type === 'select') {
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
