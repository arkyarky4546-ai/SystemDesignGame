import type { SaveStorage } from './save'

/** In-memory `SaveStorage` for tests. `items` exposes what was written. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): SaveStorage & {
  readonly items: Map<string, string>
} {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    },
  }
}

/** Fixed wall clock for save timestamps. */
export const FIXED_NOW = (): Date => new Date('2026-09-14T12:00:00.000Z')
