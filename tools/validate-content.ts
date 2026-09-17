import { createServer } from 'vite'
import type { ContentProblem } from '../src/content/parse'
import type { ContentSource, ValidationReport } from '../src/content/validate'

// `npm run validate` (03-CONTENT-SCHEMA §8). The rules live in `src/content/validate.ts` so
// tests can run them over deliberately broken fixtures; this is the runner that loads the
// real content and prints the result.
//
// Content is TypeScript with extensionless imports, which Node can't resolve on its own, so
// it's loaded through Vite's SSR module runner — the same resolver the app builds with, and
// no new dependency (ADR-0042).

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { loadContentSource } = (await server.ssrLoadModule('/src/content/source.ts')) as {
    loadContentSource: () => Promise<ContentSource>
  }
  const { validateContent } = (await server.ssrLoadModule('/src/content/validate.ts')) as {
    validateContent: (source: ContentSource) => ValidationReport
  }

  const report = validateContent(await loadContentSource())
  print(report)
  if (report.problems.length > 0) process.exitCode = 1
} finally {
  await server.close()
}

function print(report: ValidationReport) {
  const { counts, needsReview } = report
  console.log(`validate-content: ${counts.concepts} concepts, ${counts.components} components, ${counts.questions} questions`)

  for (const [file, problems] of byFile(report.problems)) {
    console.error(`\n${file}`)
    for (const problem of problems) console.error(`  ${problem.message}`)
  }

  const review = needsReview.concepts + needsReview.components + needsReview.questions
  console.log(
    `\nneeds-review: ${review} (${needsReview.concepts} concepts, ${needsReview.components} components, ${needsReview.questions} questions)`,
  )
  if (report.needsExpertReview > 0) console.log(`needs-expert-review: ${report.needsExpertReview}`)
  console.log(`incidents engine-verified: ${report.incidentsChecked} (none authored yet; see ADR-0043)`)
  console.log(report.problems.length === 0 ? '\nno problems' : `\n${report.problems.length} problem(s)`)
}

function byFile(problems: readonly ContentProblem[]): Map<string, ContentProblem[]> {
  const grouped = new Map<string, ContentProblem[]>()
  for (const problem of problems) grouped.set(problem.file, [...(grouped.get(problem.file) ?? []), problem])
  return grouped
}
