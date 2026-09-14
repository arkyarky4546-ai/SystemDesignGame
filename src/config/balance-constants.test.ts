import { describe, expect, it } from 'vitest'

// ADR-0007 and M2's acceptance criterion: no balance constant outside config/. This proves
// it for the layers that compute game rules, engine/ and state/. Their code may use 0
// and 1, and every other number must come from config/ (ADR-0026).
const sources = import.meta.glob<string>(
  ['../engine/**/*.ts', '../state/**/*.ts', '!../**/*.test.ts', '!../**/test-helpers.ts'],
  { query: '?raw', import: 'default', eager: true },
)

// Numbers that are definitions rather than tuning, allowed per file with the reason.
const EXEMPT: Readonly<Record<string, 'all' | readonly number[]>> = {
  // mulberry32 and MurmurHash3's constants are the algorithms themselves, and the normal
  // approximation's 4, 2 and √3 are its derivation. Changing any of them breaks determinism,
  // not balance.
  '../engine/rng.ts': 'all',
  // ln 100 = 2 · ln 10.
  '../engine/resolve.ts': [2],
}

const ALWAYS_ALLOWED: readonly number[] = [0, 1]

const NUMERIC_LITERAL =
  /(?<![\w$.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)n?(?![\w$])/g

/**
 * Source with comments removed and string contents emptied, so only code is scanned. Text
 * inside a template literal's ${…} is dropped with the string, a known blind spot.
 */
function codeOnly(source: string): string {
  let code = ''
  let index = 0
  while (index < source.length) {
    const char = source[index] ?? ''
    const next = source[index + 1]
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      index = end === -1 ? source.length : end
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      code += ' '
    } else if (char === '"' || char === "'" || char === '`') {
      let end = index + 1
      while (end < source.length && source[end] !== char) end += source[end] === '\\' ? 2 : 1
      code += char + char
      index = end + 1
    } else {
      code += char
      index += 1
    }
  }
  return code
}

function disallowedNumbers(path: string, source: string): string[] {
  const exempt = EXEMPT[path]
  if (exempt === 'all') return []
  const allowed = new Set([...ALWAYS_ALLOWED, ...(exempt ?? [])])
  return (codeOnly(source).match(NUMERIC_LITERAL) ?? []).filter(
    (literal) => !allowed.has(Number(literal.replace(/_/g, '').replace(/n$/, ''))),
  )
}

describe('balance constants live only in config/', () => {
  it('scans the engine and state sources, but not tests or fixtures', () => {
    const paths = Object.keys(sources)
    expect(paths).toEqual(
      expect.arrayContaining(['../engine/economy.ts', '../engine/run.ts', '../state/save.ts', '../state/store.ts']),
    )
    expect(paths.filter((path) => path.includes('.test.') || path.includes('test-helpers'))).toEqual([])
  })

  it('recognizes numeric literals and ignores comments, strings and identifiers', () => {
    const sample = [
      'const a = 0.6 + 1_000 * 0x1f - 2e3 / .5 + 12n',
      'const b = p99Ms + fmix32(LN_100) + items[1] - 0 // 42',
      "const c = '7' + \"8\" + `9` /* 10 */",
    ].join('\n')
    expect(disallowedNumbers('sample.ts', sample)).toEqual(['0.6', '1_000', '0x1f', '2e3', '.5', '12n'])
  })

  it.each(Object.entries(sources))('%s has no numbers beyond 0 and 1', (path, source) => {
    expect(disallowedNumbers(path, source), path).toEqual([])
  })
})
