export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`

export function formatHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`
}

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}
