// Small scale and format helpers shared by the chart-like components. No dependencies.

export type Scale = ((v: number) => number) & { invert: (px: number) => number; domain: [number, number]; range: [number, number] }

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  const f = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale
  f.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span
  f.domain = domain
  f.range = range
  return f
}

/** Round tick values that fit in [min, max], about `count` of them (1, 2, 5 times a power of ten). */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / Math.max(count, 1)
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const err = raw / pow
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * pow
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}

/** 850 ms, 1.20 s, 2 m 05 s. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  if (ms === 0) return '0'
  const abs = Math.abs(ms)
  if (abs < 1) return `${(ms * 1000).toFixed(0)} µs`
  if (abs < 1000) return `${Number(ms.toFixed(abs < 10 ? 1 : 0))} ms`
  if (abs < 60_000) return `${(ms / 1000).toFixed(abs < 10_000 ? 2 : 1)} s`
  const sign = ms < 0 ? '-' : ''
  if (abs >= 86_400_000) return `${sign}${Math.floor(abs / 86_400_000)} d ${Math.floor((abs % 86_400_000) / 3_600_000)} h`
  if (abs >= 3_600_000) return `${sign}${Math.floor(abs / 3_600_000)} h ${String(Math.round((abs % 3_600_000) / 60_000)).padStart(2, '0')} m`
  const m = Math.floor(abs / 60_000)
  const s = Math.round((abs % 60_000) / 1000)
  return `${ms < 0 ? '-' : ''}${m} m ${String(s).padStart(2, '0')} s`
}

export const formatCount = (n: number) => new Intl.NumberFormat('en', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n)
export const formatUsd = (n: number) => (n < 0.01 && n > 0 ? '<$0.01' : new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(n))

/** Cycles through the categorical palette defined as --ol-c1..8 in styles.css. */
export const swatch = (i: number) => `var(--ol-c${(((i % 8) + 8) % 8) + 1})`

export const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
