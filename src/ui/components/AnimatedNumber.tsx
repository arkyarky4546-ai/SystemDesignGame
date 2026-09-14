import { useEffect, useRef, useState } from 'react'
import { CHANGE_HIGHLIGHT_MS, useTurnFrames, type TurnPlayback } from '../turn-playback'

type AnimatedNumberProps = {
  readonly value: number
  /** Where the number stood before the turn, or undefined to show it without counting. */
  readonly from: number | undefined
  readonly format: (value: number) => string
  readonly playback: TurnPlayback | null
  readonly className?: string
}

/**
 * A figure that counts to its new value when a turn resolves, or, under reduced motion,
 * changes at once and is briefly highlighted (05-UI-DESIGN §2).
 */
export function AnimatedNumber({ value, from, format, playback, className = '' }: AnimatedNumberProps) {
  const element = useRef<HTMLSpanElement | null>(null)
  const [highlighted, setHighlighted] = useState(false)

  useTurnFrames(
    playback,
    (progress) => {
      if (!element.current) return
      const shown = from === undefined || progress >= 1 ? value : from + (value - from) * progress
      element.current.textContent = format(shown)
    },
    [value, from],
  )

  useEffect(() => {
    if (!playback || playback.animate || from === undefined || format(from) === format(value)) return
    setHighlighted(true)
    const timer = setTimeout(() => setHighlighted(false), CHANGE_HIGHLIGHT_MS)
    return () => {
      clearTimeout(timer)
      setHighlighted(false)
    }
    // A highlight belongs to one turn; later renders of the same turn don't restart it.
  }, [playback])

  return (
    <span ref={element} data-changed={highlighted || undefined} className={`num ${className}`}>
      {format(value)}
    </span>
  )
}
