import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type * as Bank from './bank'
import { withModules } from './vite-modules.ts'
import type { ConceptId, Question, QuestionTemplate } from '../src/content/schema'

// `npm run generate` (09-QUESTION-BANK §2.1, §4.2). Freezes each concept's derived questions
// into a committed `derived.json` and rewrites `bank-manifest.json`.
//
// Committing the output rather than generating at install time is deliberate: a template
// change shows up in review as "these 40 questions changed" instead of being invisible
// (ADR-0013). Generation is seeded, so the same templates always produce the same bytes.

const MANIFEST = 'src/content/questions/bank-manifest.json'

const derivedPath = (conceptId: string) => `src/content/questions/${conceptId}/derived.json`

await withModules(async (load) => {
  const bank = await load<typeof Bank>('/tools/bank.ts')
  const { TEMPLATES } = await load<{ TEMPLATES: Readonly<Record<ConceptId, readonly QuestionTemplate[]>> }>(
    '/src/content/questions/templates.ts',
  )
  const { AUTHORED } = await load<{ AUTHORED: Readonly<Record<ConceptId, readonly Question[]>> }>(
    '/src/content/questions/authored.ts',
  )

  const pools: Record<string, Question[]> = {}
  for (const [conceptId, authored] of Object.entries(AUTHORED)) pools[conceptId] = [...authored]

  for (const [conceptId, templates] of Object.entries(TEMPLATES)) {
    if (templates.length === 0) continue
    const result = bank.generateForConcept(templates, bank.TEMPLATE_ENGINE, bank.generationOptionsFor(conceptId))
    write(derivedPath(conceptId), bank.serializeBank(result.questions))
    pools[conceptId] = [...(pools[conceptId] ?? []), ...result.questions]
    const asked = templates.reduce((total, template) => total + template.instanceCount, 0)
    console.log(
      `${conceptId}: ${result.questions.length} derived from ${templates.length} template(s)` +
        (result.abandoned > 0 ? `, ${result.abandoned} of ${asked} abandoned` : ''),
    )
  }

  const previous = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Bank.BankManifest) : undefined
  const manifest = bank.buildManifest(pools, previous)
  write(MANIFEST, bank.serializeManifest(manifest))
  console.log(`bank-manifest: ${Object.keys(manifest.issued).length} ids issued`)
})

/** Writes a file with LF endings, so the committed bank is byte-identical on every platform. */
function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, { encoding: 'utf8' })
  console.log(`wrote ${path}`)
}
