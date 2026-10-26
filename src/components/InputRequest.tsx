'use client'

import { useId, useState, type FormEvent } from 'react'
import { cleanValues, initialValues, validateInput, type Field, type FieldValue, type Values } from './inputform.js'
import { cx } from './util.js'

export type InputRequestProps = {
  title: string
  /** Why the agent stopped to ask, in its own words. Shown as the agent's, not as a fact. */
  asked?: string
  /** What the person is deciding about, as label and value rows. */
  context?: { label: string; value: string }[]
  fields: Field[]
  /** Called with the checked values. Numbers are numbers and blank optional fields are left out. */
  onSubmit?: (values: Record<string, FieldValue>) => void
  /** Adds a way to turn the request down. The agent should be told, so this is a callback and not a default. */
  onDecline?: () => void
  submitLabel?: string
  className?: string
}

/**
 * A form an agent hands to a person when it needs information it does not have. Every answer is checked against the
 * field it was asked for before it goes back, so the agent never receives a value of a kind it did not ask for.
 */
export function InputRequest({ title, asked, context, fields, onSubmit, onDecline, submitLabel = 'Send to the agent', className }: InputRequestProps) {
  const [values, setValues] = useState<Values>(() => initialValues(fields))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const base = useId()
  const set = (name: string, v: FieldValue | undefined) => {
    setValues((x) => ({ ...x, [name]: v }))
    setErrors((e) => { if (!(name in e)) return e; const { [name]: _gone, ...rest } = e; return rest })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateInput(fields, values)
    setErrors(found)
    if (Object.keys(found).length) return
    onSubmit?.(cleanValues(fields, values))
    setSent(true)
  }
  const count = Object.keys(errors).length
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={sent ? 'good' : 'warn'}>{sent ? 'Sent' : 'The agent is waiting'}</span>
      </div>
      {asked && <p className="ol-sub" style={{ margin: '0 0 8px' }}>The agent says: {asked}</p>}
      {context && context.length > 0 && (
        <dl className="ol-dl">
          {context.map((c) => (
            <div style={{ display: 'contents' }} key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>
          ))}
        </dl>
      )}
      {fields.length === 0 ? (
        <p className="ol-sub" style={{ margin: 0 }}>The agent did not say what it needs.</p>
      ) : (
        <form className="ol-form" onSubmit={submit} noValidate aria-label={`${title}, form`}>
          {count > 0 && <p className="ol-fielderr" role="alert" style={{ margin: 0 }}>{count === 1 ? 'One answer needs fixing.' : `${count} answers need fixing.`}</p>}
          {fields.map((f) => {
            const id = `${base}-${f.name}`
            const err = errors[f.name]
            const common = { name: f.name, 'aria-invalid': !!err, 'aria-describedby': err ? `${id}-err` : f.help ? `${id}-help` : undefined, disabled: sent }
            return (
              <div key={f.name} className="ol-field" data-type={f.type}>
                {f.type === 'checkbox' ? (
                  <label className="ol-check"><input type="checkbox" {...common} checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}{f.required ? ' (required)' : ''}</label>
                ) : (
                  <label htmlFor={id} className="ol-qhead">{f.label}{f.required ? '' : ' (optional)'}</label>
                )}
                {f.type === 'textarea' && <textarea className="ol-textarea" rows={3} id={id} {...common} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} />}
                {f.type === 'select' && (
                  <select className="ol-textarea" id={id} {...common} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value || undefined)}>
                    <option value="">Choose…</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {(f.type === 'text' || f.type === 'number' || f.type === 'currency') && (
                  <input className="ol-textarea" id={id} {...common} type="text" inputMode={f.type === 'text' ? undefined : 'decimal'} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} />
                )}
                {f.help && !err && <p id={`${id}-help`} className="ol-sub" style={{ margin: 0 }}>{f.help}</p>}
                {err && <p id={`${id}-err`} className="ol-sub ol-fielderr" style={{ margin: 0 }}>{err}</p>}
              </div>
            )
          })}
          <div className="ol-actions" style={{ marginTop: 6 }}>
            <button type="submit" className="ol-btn" data-kind="approve" disabled={sent}>{submitLabel}</button>
            {onDecline && <button type="button" className="ol-btn" disabled={sent} onClick={onDecline}>Decline to answer</button>}
          </div>
        </form>
      )}
    </section>
  )
}
