import { useLayoutEffect, useRef, type DependencyList } from 'react'
import type { RunState } from '../engine'

// The one orchestrated moment (05-UI-DESIGN §2): after Advance, load flows along the edges,
// nodes fill and change color, and numbers count to their new values. Everything else in
// the interface is instant.

/** How long the turn animation runs, ms (§2: ~800 ms). */
export const TURN_ANIMATION_MS = 800

/** How long a changed value stays highlighted when motion is reduced, ms. */
export const CHANGE_HIGHLIGHT_MS = 1200

/** One Advance as the screens replay it. */
export type TurnPlayback = {
  /** The turn resolved. */
  readonly turn: number
  /** `performance.now()` when the result arrived. Components that mount late join mid-way or skip. */
  readonly startedAt: number
  /** False under reduced motion: a direct cut, with changed values highlighted instead (§2). */
  readonly animate: boolean
  /** The run before the turn, where every animated value starts. */
  readonly before: RunState
}

/** Quick start, gentle finish, 0..1 → 0..1. */
export function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3
}

/**
 * Paints an animation frame by frame, straight onto the DOM, so the animation re-renders
 * nothing (the M3 drag does the same). `paint` receives eased progress, 0..1, and must
 * write exactly what React renders when it's called with 1. Every change to `playback` or
 * `deps` paints again: from where the animation stands, or straight to the end when there
 * is nothing to animate.
 */
export function useTurnFrames(playback: TurnPlayback | null, paint: (progress: number) => void, deps: DependencyList): void {
  const latestPaint = useRef(paint)
  useLayoutEffect(() => {
    latestPaint.current = paint
  })

  useLayoutEffect(() => {
    const progressAt = (now: number) => (playback ? Math.min(1, Math.max(0, (now - playback.startedAt) / TURN_ANIMATION_MS)) : 1)
    const start = progressAt(performance.now())
    if (!playback?.animate || start >= 1) {
      latestPaint.current(1)
      return
    }
    latestPaint.current(easeOut(start))
    let frame = requestAnimationFrame(function step() {
      // performance.now() rather than the frame timestamp, which some environments don't
      // supply on the same clock.
      const progress = progressAt(performance.now())
      latestPaint.current(easeOut(progress))
      if (progress < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
    // The caller's deps decide when to repaint; `paint` is read through a ref.
  }, [playback, ...deps])
}
