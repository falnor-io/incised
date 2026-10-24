import { useEffect, useRef, useState, type RefObject } from 'react'

/** Width of an element, kept current with ResizeObserver. Returns `initial` on the server and before first measure. */
export function useWidth<T extends HTMLElement>(initial = 720): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Copies text and reports success briefly. Safe when the clipboard is unavailable. */
export function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    done,
    (text) => {
      navigator.clipboard?.writeText(text).then(() => {
        setDone(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1400)
      }, () => undefined)
    },
  ]
}
