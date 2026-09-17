import type * as BankFiles from './bank-files'
import { withModules } from './vite-modules.ts'

// `npm run generate` (09-QUESTION-BANK §2.1, §4.2). Freezes each concept's derived questions
// into a committed `derived.json` and rewrites `bank-manifest.json`.
//
// Committing the output rather than generating at install time is deliberate: a template
// change shows up in review as "these 40 questions changed" instead of being invisible
// (ADR-0013). Generation is seeded, so the same templates always produce the same bytes.

await withModules(async (load) => {
  const files = await load<typeof BankFiles>('/tools/bank-files.ts')
  const result = files.regenerate()
  for (const concept of result.perConcept) {
    console.log(
      `${concept.conceptId}: ${concept.generated} derived` + (concept.abandoned > 0 ? `, ${concept.abandoned} abandoned` : ''),
    )
  }
  console.log(`bank-manifest: ${result.issued} ids issued`)
})
