'use client'

import { useId, useState, type FormEvent } from 'react'
import { cleanValues, initialValues, linkInfo, splitSecretFields, validateInput, type ElicitationResult, type Field, type FieldValue, type Values } from './inputform.js'
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
  /** Who is asking, so the person can tell. */
  from?: string
  /** For something that must not pass through this page, such as a password or a payment: a link the person opens instead. Only plain https links are offered, with the site named. */
  link?: { url: string; label?: string }
  /** Adds a way to turn the request down. The agent should be told, so this is a callback and not a default. */
  onDecline?: () => void
  /** Adds a way to close the request without answering either way. */
  onCancel?: () => void
  /** The answer in the shape MCP elicitation uses: accept with the values, decline, or cancel. Called alongside the callbacks above. */
  onResult?: (result: ElicitationResult) => void
  submitLabel?: string
  className?: string
}

/**
 * A form an agent hands to a person when it needs information it does not have. Every answer is checked against the
 * field it was asked for before it goes back, so the agent never receives a value of a kind it did not ask for.
 */
export function InputRequest({ title, asked, from, link, context, fields: requested, onSubmit, onDecline, onCancel, onResult, submitLabel = 'Send to the agent', className }: InputRequestProps) {
  const { allowed: fields, refused } = splitSecretFields(requested)
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
    const clean = cleanValues(fields, values)
    onSubmit?.(clean)
    onResult?.({ action: 'accept', content: clean })
    setSent(true)
  }
  const count = Object.keys(errors).length
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-pill" data-tone={sent ? 'good' : 'warn'}>{sent ? 'Sent' : 'The agent is waiting'}</span>
      </div>
      {from && <p className="ol-sub" style={{ margin: '0 0 4px' }}>Asked by {from}</p>}
      {asked && <p className="ol-sub" style={{ margin: '0 0 8px' }}>The agent says: {asked}</p>}
      {context && context.length > 0 && (
        <dl className="ol-dl">
          {context.map((c) => (
            <div style={{ display: 'contents' }} key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>
          ))}
        </dl>
      )}
      {refused.length > 0 && (
        <p className="ol-sub ol-fielderr" role="note" style={{ margin: '0 0 8px' }}>
          The agent also asked for {refused.map((f) => f.label).join(', ')}. This form does not collect passwords, keys or card details.{link ? ' Use the link below.' : ''}
        </p>
      )}
      {link && (() => {
        const info = linkInfo(link.url)
        return info.ok ? (
          <p style={{ margin: '0 0 8px' }}>
            <a className="ol-btn" href={info.href} target="_blank" rel="noopener noreferrer">{link.label ?? 'Continue'} on <b>{info.host}</b></a>
          </p>
        ) : (
          <p className="ol-sub ol-fielderr" role="note" style={{ margin: '0 0 8px' }}>The link was not offered. {info.reason}</p>
        )
      })()}
      {fields.length === 0 ? (
        <p className="ol-sub" style={{ margin: 0 }}>{refused.length > 0 || link ? 'Nothing else was asked.' : 'The agent did not say what it needs.'}</p>
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
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{f.optionLabels?.[o] ?? o}</option>)}
                  </select>
                )}
                {(f.type === 'text' || f.type === 'number' || f.type === 'currency' || f.type === 'email' || f.type === 'url' || f.type === 'date') && (
                  <input className="ol-textarea" id={id} {...common} type="text" inputMode={f.type === 'number' || f.type === 'currency' ? 'decimal' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined} placeholder={f.type === 'date' ? '2026-06-10' : undefined} autoComplete="off" value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} />
                )}
                {f.help && !err && <p id={`${id}-help`} className="ol-sub" style={{ margin: 0 }}>{f.help}</p>}
                {err && <p id={`${id}-err`} className="ol-sub ol-fielderr" style={{ margin: 0 }}>{err}</p>}
              </div>
            )
          })}
          <div className="ol-actions" style={{ marginTop: 6 }}>
            <button type="submit" className="ol-btn" data-kind="approve" disabled={sent}>{submitLabel}</button>
            {onDecline && <button type="button" className="ol-btn" disabled={sent} onClick={() => { onDecline(); onResult?.({ action: 'decline' }) }}>Decline to answer</button>}
            {onCancel && <button type="button" className="ol-btn" disabled={sent} onClick={() => { onCancel(); onResult?.({ action: 'cancel' }) }}>Not now</button>}
          </div>
        </form>
      )}
    </section>
  )
}
