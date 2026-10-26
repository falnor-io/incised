import { checkHandoff, type Handoff } from './handoff.js'
import { cx, formatWhen } from './util.js'

export type HandoffPacketProps = {
  title: string
  /** What the agent handed over. Anything missing is shown as missing, not hidden. */
  handoff: Partial<Handoff>
  now?: string | Date
  className?: string
}

const left = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60000)
  const t = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
  return ms < 0 ? `${t} past the deadline` : `${t} to act`
}

const TRIGGER = { asked: 'the person asked', 'high-stakes': 'a high-stakes task', 'repeated-failure': 'a second failed attempt', sentiment: 'the person sounded frustrated', limit: 'a limit was reached', other: 'another rule' } as const
const Gap = ({ what }: { what: string }) => <span className="ol-gap-note">Missing: {what}</span>

/**
 * What an agent hands a person when it stops. The packet is checked, not trusted: a handoff is complete only when a
 * person could act without asking the agent anything, and every part that is missing is named.
 */
export function HandoffPacket({ title, handoff: h, now, className }: HandoffPacketProps) {
  const c = checkHandoff(h, now)
  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <strong>{title}</strong>
        <span className="ol-chips">
          {h.transfer && <span className="ol-pill" data-tone={h.transfer === 'warm' ? 'good' : 'warn'}>{h.transfer === 'warm' ? 'Warm handoff' : 'Cold handoff'}</span>}
          <span className="ol-pill" data-tone={c.complete ? 'good' : 'warn'}>{c.complete ? 'Complete' : c.missing.length ? `${c.missing.length} missing` : 'Recipient unchecked'}</span>
          {c.leftMs !== undefined && <span className="ol-pill" data-tone={c.late ? 'bad' : undefined}>{left(c.leftMs)}</span>}
        </span>
      </div>
      <p className="ol-sub" style={{ margin: '0 0 8px' }}>{c.text}</p>
      <dl className="ol-hand">
        <dt>Doing</dt>
        <dd>{h.summary?.trim() ? h.summary : <Gap what="what it was doing" />}</dd>
        <dt>Tried</dt>
        <dd>{h.attempted?.length ? <ul>{h.attempted.map((a) => <li key={a}>{a}</li>)}</ul> : <Gap what="what it tried" />}</dd>
        <dt>Stopped</dt>
        <dd>{h.stoppedBecause?.trim() ? h.stoppedBecause : <Gap what="why it stopped" />}{h.trigger && <span className="ol-sub"> · {TRIGGER[h.trigger.kind]}{h.trigger.detail ? `: ${h.trigger.detail}` : ''}</span>}</dd>
        <dt>Suggests</dt>
        <dd>{h.recommended?.action ? <><b>{h.recommended.action}.</b> {h.recommended.why}</> : <Gap what="a recommendation" />}</dd>
        <dt>Needs</dt>
        <dd>{h.needsFrom ? <>{h.needsFrom}{h.recipient && <span className="ol-sub"> ({h.recipient.name}{h.recipient.verified ? ', checked' : ', not checked'})</span>}{h.deadline && <span className="ol-sub"> by {formatWhen(h.deadline)}</span>}{!h.deadline && <> <Gap what="a deadline" /></>}</> : <Gap what="who has to act" />}</dd>
        <dt>Check</dt>
        <dd>{h.evidence?.length ? <ul>{h.evidence.map((e) => <li key={e.label}>{e.label}{e.ref && <span className="ol-sub"> {e.ref}</span>}</li>)}</ul> : <Gap what="evidence to check" />}</dd>
      </dl>
      {c.notes.length > 0 && <ul className="ol-grant-problems" aria-label="Notes" style={{ marginTop: 8 }}>{c.notes.map((n) => <li key={n} className="ol-gap-note">{n}</li>)}</ul>}
    </section>
  )
}
