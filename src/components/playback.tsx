'use client'

import { useEffect, useState } from 'react'
import { clampIndex } from './theatre.js'
import { reduceMotion } from './motion.js'

/**
 * Shared playhead for components that can replay themselves one step at a time. The index is always a real step,
 * nothing plays unless asked, and reduced motion still steps but never autoplays.
 */
export function usePlayback(count: number, { intervalMs = 1600, start = 0, param }: { intervalMs?: number; start?: number; param?: string } = {}) {
  const [index, setIndex] = useState(start)
  const [playing, setPlaying] = useState(false)
  const at = clampIndex(index, count)
  const last = count > 0 && at === count - 1

  // Deep link: ?param=3 opens on the third step, and moving the playhead keeps the address current. Read after mount so server markup matches.
  useEffect(() => {
    if (!param) return
    const n = Number(new URLSearchParams(window.location.search).get(param))
    if (Number.isInteger(n) && n >= 1) setIndex(n - 1)
  }, [param])
  useEffect(() => {
    if (!param || count === 0) return
    const url = new URL(window.location.href)
    if (url.searchParams.get(param) === String(at + 1)) return
    url.searchParams.set(param, String(at + 1))
    window.history.replaceState(null, '', url)
  }, [param, at, count])

  useEffect(() => {
    if (!playing) return
    if (last || reduceMotion()) { setPlaying(false); return }
    const t = setTimeout(() => setIndex(at + 1), intervalMs)
    return () => clearTimeout(t)
  }, [playing, at, last, intervalMs])

  return {
    at,
    last,
    playing,
    set: (i: number) => setIndex(clampIndex(i, count)),
    toggle: () => { if (last) setIndex(0); setPlaying((p) => !p || last) },
  }
}

export type PlaybackState = ReturnType<typeof usePlayback>

/** Play, back, next and a scrubber. Arrow keys and space work while the bar has focus. */
export function PlaybackBar({ pb, count, label }: { pb: PlaybackState; count: number; label: string }) {
  return (
    <div
      className="ol-playbar"
      role="toolbar"
      aria-label={`${label} playback`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { pb.set(pb.at + 1); e.preventDefault() }
        else if (e.key === 'ArrowLeft') { pb.set(pb.at - 1); e.preventDefault() }
      }}
    >
      <button type="button" className="ol-btn" onClick={() => pb.set(pb.at - 1)} disabled={pb.at === 0}>Back</button>
      <button type="button" className="ol-btn" onClick={pb.toggle} aria-pressed={pb.playing}>{pb.playing ? 'Pause' : pb.last ? 'Replay' : 'Play'}</button>
      <button type="button" className="ol-btn" onClick={() => pb.set(pb.at + 1)} disabled={pb.last}>Next</button>
      <input className="ol-scrub" type="range" min={0} max={Math.max(0, count - 1)} value={pb.at} onChange={(e) => pb.set(Number(e.target.value))} aria-label={`${label} position`} />
      <span className="ol-sub ol-mono">{count === 0 ? 0 : pb.at + 1} / {count}</span>
    </div>
  )
}
