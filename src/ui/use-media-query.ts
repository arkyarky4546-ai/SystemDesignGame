import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, updating when it changes. `fallback` applies where
 * `matchMedia` doesn't exist, as in server rendering and some test environments.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => undefined
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => (typeof matchMedia === 'function' ? matchMedia(query).matches : fallback),
    () => fallback,
  )
}
