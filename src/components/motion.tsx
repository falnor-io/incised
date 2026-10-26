'use client'

import { useEffect, useRef, useState } from 'react'
import { countUp } from './theatre.js'

/**
 * Motion for the existing components. Three rules keep it honest:
 * - Nothing animates on first paint. A number starts at its value, so server-rendered markup reads the same as the page.
 * - A change animates from the value on screen to the new one, so a figure never jumps to zero and back.
 * - Reduced motion turns every animation off, and the final value is shown at once.
 */

export const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Eases a number from its current value to `target` when `target` changes. Returns the value to show. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target)
  const shown = useRef(target)
  useEffect(() => {
    const from = shown.current
    if (from === target) return
    if (reduceMotion()) { shown.current = target; setValue(target); return }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const v = from + countUp(target - from, k)
      shown.current = k < 1 ? v : target
      setValue(shown.current)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}


/** A figure that eases to a new value when it changes. Renders the final value on first paint. Props are plain data, so a server component can pass them. */
export function Count({ value, digits = 0, prefix = '', suffix = '' }: { value: number; digits?: number; prefix?: string; suffix?: string }) {
  const v = useCountUp(Number.isFinite(value) ? value : 0)
  if (!Number.isFinite(value)) return <>{prefix}{String(value)}{suffix}</>
  return <>{prefix}{v.toLocaleString('en-US', { maximumFractionDigits: digits })}{suffix}</>
}
