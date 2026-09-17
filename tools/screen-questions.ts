import { existsSync, readFileSync } from 'node:fs'
import type * as Bank from './bank'
import { withModules } from './vite-modules.ts'
import type { ConceptId, Question, QuestionTemplate } from '../src/content/schema'
import type { ContentSource } from '../src/content/validate'

// `npm run screen` (09-QUESTION-BANK §7). Every generated or authored batch passes through
// here before a human looks at it, so anything it rejects never costs attention.
//
// Errors stop the batch: a derived answer the engine disagrees with, two options within 2%,
// a missing whyWrong, a banned phrase, an id the manifest already issued. Warnings are for a
// human to judge: near-duplicates, lengths, depth spread, tag coverage, answer leakage.

const MANIFEST = 'src/content/questions/bank-manifest.json'

await withModules(async (load) => {
  const bank = await load<typeof Bank>('/tools/bank.ts')
  const { loadContentSource } = await load<{ loadContentSource: () => Promise<ContentSource> }>('/src/content/source.ts')
  const { TEMPLATES } = await load<{ TEMPLATES: Readonly<Record<ConceptId, readonly QuestionTemplate[]>> }>(
    '/src/content/questions/templates.ts',
  )

  const source = await loadContentSource()
  const findings = [
    ...bank.screenQuestions({
      concepts: source.concepts,
      questions: source.questions,
      engine: bank.TEMPLATE_ENGINE,
      templates: TEMPLATES,
    }),
    ...manifestFindings(bank, source.questions),
  ]

  const total = Object.values(source.questions).flat().length
  console.log(`screen-questions: ${total} questions across ${source.concepts.length} concepts`)
  report(findings, 'error')
  report(findings, 'warning')

  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.length - errors
  console.log(`\n${errors} error(s), ${warnings} warning(s)`)
  if (errors > 0) process.exitCode = 1
})

function manifestFindings(bank: typeof Bank, questions: Readonly<Record<string, readonly Question[]>>): readonly Bank.Finding[] {
  if (!existsSync(MANIFEST)) {
    return [{ severity: 'error', rule: 'bank manifest', questionId: MANIFEST, detail: 'is missing; run npm run generate' }]
  }
  return bank.checkManifest(questions, JSON.parse(readFileSync(MANIFEST, 'utf8')) as Bank.BankManifest)
}

function report(findings: readonly Bank.Finding[], severity: Bank.Finding['severity']) {
  const matching = findings.filter((finding) => finding.severity === severity)
  if (matching.length === 0) return
  const write = severity === 'error' ? console.error : console.log
  write(`\n${severity}s:`)
  for (const rule of [...new Set(matching.map((finding) => finding.rule))]) {
    write(`  ${rule}`)
    for (const finding of matching.filter((each) => each.rule === rule)) {
      write(`    ${finding.questionId}: ${finding.detail}`)
    }
  }
}
