import { describe, expect, it } from 'vitest'

// Engine sources loaded as raw text through Vite, so the scan needs no filesystem access.
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

// Written as regexes so this file never contains the calls it searches for (02-SIMULATION §2).
const FORBIDDEN: readonly RegExp[] = [
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew\s+Date\b/,
  /\bperformance\.now\b/,
  /\bcrypto\.getRandomValues\b/,
]

describe('engine determinism guard', () => {
  it('scans the engine sources', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(['./rng.ts', './resolve.ts', './topology.ts', './types.ts']),
    )
  })

  it('recognizes every forbidden call', () => {
    const samples = [
      ['Math', 'random'],
      ['Date', 'now'],
      ['performance', 'now'],
      ['crypto', 'getRandomValues'],
    ].map((parts) => `${parts.join('.')}()`)
    samples.push(['new', 'Date()'].join(' '))
    for (const sample of samples) {
      expect(FORBIDDEN.some((pattern) => pattern.test(sample)), sample).toBe(true)
    }
  })

  it.each(Object.entries(sources))('%s uses no wall clock or unseeded randomness', (path, source) => {
    const hits = FORBIDDEN.filter((pattern) => pattern.test(source)).map(String)
    expect(hits, path).toEqual([])
  })
})
