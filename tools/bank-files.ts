import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AUTHORED } from '../src/content/questions/authored'
import { TEMPLATES } from '../src/content/questions/templates'
import type { Question } from '../src/content/schema'
import { buildManifest, generateForConcept, generationOptionsFor, serializeBank, serializeManifest, TEMPLATE_ENGINE, type BankManifest } from './bank'

// Writing the frozen bank to disk. One source of truth for `npm run generate` and for the
// review tool, which regenerates a concept after a template decision so that approving a
// template marks its instances reviewed in one action (09-QUESTION-BANK §8).
//
// Loaded through Vite, like everything else that reaches into src/ (ADR-0044).

export const MANIFEST_FILE = 'src/content/questions/bank-manifest.json'

export const derivedFileFor = (conceptId: string) => `src/content/questions/${conceptId}/derived.json`

export type RegenerateResult = {
  readonly perConcept: readonly { readonly conceptId: string; readonly generated: number; readonly abandoned: number }[]
  readonly issued: number
}

/** Regenerates every concept's derived bank and rewrites the manifest. */
export function regenerate(): RegenerateResult {
  const pools: Record<string, Question[]> = {}
  for (const [conceptId, authored] of Object.entries(AUTHORED)) pools[conceptId] = [...authored]

  const perConcept: RegenerateResult['perConcept'] = Object.entries(TEMPLATES).flatMap(([conceptId, templates]) => {
    if (templates.length === 0) return []
    const result = generateForConcept(templates, TEMPLATE_ENGINE, generationOptionsFor(conceptId))
    write(derivedFileFor(conceptId), serializeBank(result.questions))
    pools[conceptId] = [...(pools[conceptId] ?? []), ...result.questions]
    return [{ conceptId, generated: result.questions.length, abandoned: result.abandoned }]
  })

  const previous = existsSync(MANIFEST_FILE) ? (JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as BankManifest) : undefined
  const manifest = buildManifest(pools, previous)
  write(MANIFEST_FILE, serializeManifest(manifest))
  return { perConcept, issued: Object.keys(manifest.issued).length }
}

/** Writes with LF endings, so the committed bank is byte-identical on every platform. */
export function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, { encoding: 'utf8' })
}
