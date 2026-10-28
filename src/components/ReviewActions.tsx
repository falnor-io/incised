'use client'

import { useId, useState } from 'react'
import type { DecisionKind } from './approval.js'

export type ReviewActionsProps = {
  allowed: DecisionKind[]
  editable: boolean
  approveLabel: string
  blocked: boolean
  plan: unknown
  onDecide: (kind: DecisionKind, message?: string) => void
  onEdit: (plan: unknown) => void
}

/** The reviewer's buttons, the reason or reply field they share, and the plan editor. */
export function ReviewActions({ allowed, editable, approveLabel, blocked, plan, onDecide, onEdit }: ReviewActionsProps) {
  const base = useId()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  const decide = (kind: DecisionKind) => {
    const message = note.trim()
    if (kind === 'respond' && !message) { setNoteError('Write the reply first'); return }
    setNote('')
    setNoteError(null)
    onDecide(kind, message || undefined)
  }
  const save = () => {
    if (draft === null) return
    let parsed: unknown
    try { parsed = JSON.parse(draft) } catch (e) { setDraftError(`This is not valid JSON: ${(e as Error).message}`); return }
    if (JSON.stringify(parsed) === JSON.stringify(plan)) { setDraftError('Nothing changed.'); return }
    setDraft(null)
    setDraftError(null)
    onEdit(parsed)
  }

  if (draft !== null) {
    return (
      <div className="ol-editplan">
        <label className="ol-qhead" htmlFor={`${base}-plan`}>Edit the plan</label>
        <textarea id={`${base}-plan`} className="ol-textarea ol-mono" rows={Math.min(14, draft.split('\n').length + 1)} value={draft} spellCheck={false} onChange={(e) => { setDraft(e.target.value); setDraftError(null) }} aria-describedby={draftError ? `${base}-plan-err` : undefined} aria-invalid={!!draftError} />
        {draftError && <p id={`${base}-plan-err`} className="ol-sub ol-fielderr" role="alert">{draftError}</p>}
        <p className="ol-sub ol-mt-1"  title="Saving makes this a different plan, so earlier approvals stop counting.">A saved edit needs its own approval.</p>
        <div className="ol-actions">
          <button type="button" className="ol-btn" data-kind="approve" onClick={save}>Save the edited plan</button>
          <button type="button" className="ol-btn" onClick={() => { setDraft(null); setDraftError(null) }}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <>
      {(allowed.includes('reject') || allowed.includes('respond')) && (
        <div className="ol-note">
          <label className="ol-qhead" htmlFor={`${base}-note`}>{allowed.includes('respond') ? 'Reason or reply' : 'Reason'}</label>
          <textarea id={`${base}-note`} className="ol-textarea" rows={2} value={note} disabled={blocked} onChange={(e) => { setNote(e.target.value); setNoteError(null) }} aria-invalid={!!noteError} aria-describedby={noteError ? `${base}-note-err` : undefined} placeholder="Goes to the agent" />
          {noteError && <p id={`${base}-note-err`} className="ol-sub ol-fielderr" role="alert">{noteError}</p>}
        </div>
      )}
      <div className="ol-actions">
        {allowed.includes('approve') && <button type="button" className="ol-btn" data-kind="approve" disabled={blocked} onClick={() => decide('approve')}>{approveLabel}<kbd>A</kbd></button>}
        {allowed.includes('reject') && <button type="button" className="ol-btn" data-kind="reject" disabled={blocked} onClick={() => decide('reject')}>Reject<kbd>R</kbd></button>}
        {allowed.includes('escalate') && <button type="button" className="ol-btn" disabled={blocked} onClick={() => decide('escalate')}>Escalate<kbd>E</kbd></button>}
        {allowed.includes('respond') && <button type="button" className="ol-btn" disabled={blocked} onClick={() => decide('respond')}>Reply without running</button>}
        {editable && <button type="button" className="ol-btn" disabled={blocked} onClick={() => { setDraft(JSON.stringify(plan, null, 2)); setDraftError(null) }}>Edit the plan</button>}
      </div>
    </>
  )
}
