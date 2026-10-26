'use client'

import { useEffect, useState } from 'react'
import { countUp } from './theatre.js'
import { cx } from './util.js'

export type SealedStat = { label: string; value: number; suffix?: string }
export type SealedRecordProps = {
  title: string
  stats: SealedStat[]
  /** The line under the title, saying what was sealed. */
  sealedText: string
  /** Count up from zero on mount. Off for pages that are printed or read without scripts. */
  animate?: boolean
  onSave?: () => void
  saveLabel?: string
  className?: string
}

const DURATION = 900

/**
 * The end of a run, as a seal: the figures count up to their final values, and the record is marked sealed. A figure reads
 * its final value in the markup for screen readers, so the animation never changes what is announced.
 */
export function SealedRecord({ title, stats, sealedText, animate = true, onSave, saveLabel = 'Save to your record', className }: SealedRecordProps) {
  const [t, setT] = useState(animate ? 0 : 1)

  useEffect(() => {
    if (!animate) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setT(1); return }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / DURATION)
      setT(k)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate])

  return (
    <section role="group" className={cx('ol', 'ol-sealed', className)} aria-label={title}>
      <div className="ol-seal" aria-hidden="true"><i /></div>
      <h3 className="ol-title" style={{ margin: '4px 0 0' }}>{title}</h3>
      <p className="ol-sub" style={{ margin: '2px 0 10px' }}>{sealedText}</p>
      <dl className="ol-sealstats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="ol-sub">{s.label}</dt>
            <dd aria-label={`${s.value}${s.suffix ? ` ${s.suffix}` : ''}`}>
              <span className="ol-sealnum">{Math.round(countUp(s.value, t))}</span>
              {s.suffix && <span className="ol-sub"> {s.suffix}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {onSave && <button type="button" className="ol-btn" data-kind="approve" onClick={onSave} style={{ marginTop: 12 }}>{saveLabel}</button>}
    </section>
  )
}
