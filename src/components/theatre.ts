import type { CSSProperties } from 'react'

// Rules for playing a run back one step at a time. The point of each: the playhead is always a real step, the time
// left is the sum of the steps still to come, and the callout points at a value the run actually produced.

export type Stage = {
  id: string
  title: string
  /** What the step says while it plays. Shown as the caption, one word at a time. */
  detail?: string
  /** What the step needed before it could run. */
  inputs?: string[]
  /** What it produced. */
  result?: string
  /** How long the step takes, in minutes. Used for the time left. */
  minutes?: number
  /** Where the loupe points on the stage, as shares of its width and height (0 to 1), and the value it shows. */
  focus?: { x: number; y: number; label: string }
}

export type StageState = 'done' | 'current' | 'todo'

/** Keeps an index on a real step. An empty run has index 0 and nothing to show. */
export function clampIndex(i: number, n: number): number {
  if (n <= 0) return 0
  const v = Number.isFinite(i) ? Math.round(i) : 0
  return Math.min(n - 1, Math.max(0, v))
}

const mins = (s: Stage) => (Number.isFinite(s.minutes) ? Math.max(0, s.minutes!) : 0)

/** Minutes of the steps from the playhead to the end, including the one playing. */
export function minutesLeft(stages: Stage[], index: number): number {
  return stages.slice(clampIndex(index, stages.length)).reduce((n, s) => n + mins(s), 0)
}

/** Minutes of the steps before the playhead. */
export function minutesDone(stages: Stage[], index: number): number {
  return stages.slice(0, clampIndex(index, stages.length)).reduce((n, s) => n + mins(s), 0)
}

export const stateOf = (index: number, i: number): StageState => (i < index ? 'done' : i === index ? 'current' : 'todo')

/**
 * Where the loupe circle sits: beside the point it magnifies, on the side with room, and kept fully inside the stage. The
 * leader line runs from the point to the circle's centre.
 */
export function loupeAt(focus: { x: number; y: number }, box: { w: number; h: number }, radius: number): { cx: number; cy: number; tipX: number; tipY: number; r: number } {
  const r = Math.max(24, radius)
  const w = Math.max(1, box.w)
  const h = Math.max(1, box.h)
  const fx = Math.min(1, Math.max(0, Number.isFinite(focus.x) ? focus.x : 0.5))
  const fy = Math.min(1, Math.max(0, Number.isFinite(focus.y) ? focus.y : 0.5))
  const tipX = fx * w
  const tipY = fy * h
  const side = fx < 0.5 ? 1 : -1
  const cx = Math.min(w - r, Math.max(r, tipX + side * r * 1.7))
  const cy = Math.min(h - r, Math.max(r, tipY - r * 0.6))
  return { cx, cy, tipX, tipY, r }
}

/** Eases a count from 0 to `target` over `t` in 0 to 1, fast at first and slowing down. */
export function countUp(target: number, t: number): number {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1))
  return target * (1 - Math.pow(1 - k, 3))
}

/** Per-item timing for the `.ol-in` and `.ol-grow` entrances: item `i` starts `i` steps after the first. */
export const after = (i: number): CSSProperties => ({ ['--i' as string]: i })

/** How a unit reads next to a number: a symbol before it for money, the unit after it for anything else. */
export function unitAffix(unit: string): { prefix: string; suffix: string } {
  const sym = ({ USD: '$', GBP: '£', EUR: '€' } as Record<string, string>)[unit]
  return sym ? { prefix: sym, suffix: '' } : { prefix: '', suffix: ` ${unit}` }
}
