import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUTHORED } from '../src/content/questions/authored'
import type { Question } from '../src/content/schema'

// 09-QUESTION-BANK §4.2 and M6's acceptance: opening a Tier 1 check downloads that concept's
// chunk and nothing else. This asserts it in the build output; the network panel is the other
// half of that criterion and is the human's to look at.
//
// `npm run build` is part of the definition of done, so dist/ is there whenever this matters.

const ASSETS = 'dist/assets'

const derivedFor = (conceptId: string): readonly Question[] => {
  const path = `src/content/questions/${conceptId}/derived.json`
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Question[]) : []
}

const POOLS = Object.fromEntries(
  Object.entries(AUTHORED).map(([conceptId, authored]) => [conceptId, [...authored, ...derivedFor(conceptId)]]),
)

/** One id from each concept: enough to tell whose questions a chunk holds. */
const MARKERS = Object.fromEntries(
  Object.entries(POOLS).map(([conceptId, pool]) => [conceptId, pool.map((question) => question.id)]),
)

function chunks(): readonly { readonly name: string; readonly text: string }[] {
  if (!existsSync(ASSETS)) return []
  return readdirSync(ASSETS)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, text: readFileSync(`${ASSETS}/${name}`, 'utf8') }))
}

/** Which concepts' questions a chunk contains. */
const conceptsIn = (text: string) =>
  Object.entries(MARKERS)
    .filter(([, ids]) => ids.some((id) => text.includes(id)))
    .map(([conceptId]) => conceptId)

describe('the built bundle (09-QUESTION-BANK §4.2)', () => {
  const built = chunks()

  it('has something to look at', () => {
    // Without a build there is nothing to assert; the content registries are still checked.
    expect(Object.keys(POOLS).length).toBeGreaterThan(0)
    if (built.length === 0) expect(existsSync(ASSETS)).toBe(false)
  })

  it('keeps every question out of the entry chunk', () => {
    if (built.length === 0) return
    const entry = built.filter((chunk) => chunk.name.startsWith('index-'))
    expect(entry.length).toBeGreaterThan(0)
    for (const chunk of entry) expect(conceptsIn(chunk.text), chunk.name).toEqual([])
  })

  it('never puts two concepts’ questions in one chunk', () => {
    if (built.length === 0) return
    for (const chunk of built) expect(conceptsIn(chunk.text).length, chunk.name).toBeLessThanOrEqual(1)
  })

  it('does ship every concept’s questions, in some chunk', () => {
    if (built.length === 0) return
    const shipped = new Set(built.flatMap((chunk) => conceptsIn(chunk.text)))
    expect([...shipped].sort()).toEqual(Object.keys(POOLS).sort())
  })

  it('leaves the entry chunk inside the initial-bundle budget', () => {
    if (built.length === 0) return
    // 01-ARCHITECTURE §8 budgets 200 KB gzipped. Raw bytes are the proxy here: gzip on this
    // kind of text runs better than 2.6×, so a raw entry under 520 KB is comfortably inside.
    const entry = built.find((chunk) => chunk.name.startsWith('index-'))
    if (!entry) throw new Error('expected an entry chunk')
    expect(statSync(`${ASSETS}/${entry.name}`).size).toBeLessThan(520_000)
  })
})
