import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import type * as Bank from './bank'
import type * as BankFiles from './bank-files'
import type * as Queue from './review-queue'
import { withModules, type LoadModule } from './vite-modules.ts'
import type { Block, Concept, ConceptId, Question, QuestionTemplate } from '../src/content/schema'
import type { ContentSource } from '../src/content/validate'

// `npm run review` (09-QUESTION-BANK §8). Local only: it lives in tools/, nothing under src/
// imports it, and Vite builds only what index.html reaches, so it is absent from dist/.
//
// One item at a time, keyboard-driven, with the lesson one key away. The queue is templates
// first, then a seeded 10% sample of their instances, then authored questions — because
// approving a template is what makes its forty instances cheap.

const LOG_FILE = 'content/review-log.jsonl'

const KEYS = `  a approve   r reject   e edit   f flag for an expert   ? lesson   s skip   q quit`

type Snapshot = {
  readonly concepts: readonly Concept[]
  readonly queue: readonly Queue.ReviewItem[]
  readonly findingsFor: (id: string) => readonly Bank.Finding[]
}

const reviewer = process.env.USER ?? process.env.USERNAME ?? 'human'
const spotCheckOnly = process.argv.includes('--spot-check')
const includeReviewed = process.argv.includes('--all')

async function snapshot(load: LoadModule): Promise<Snapshot> {
  const bank = await load<typeof Bank>('/tools/bank.ts')
  const queue = await load<typeof Queue>('/tools/review-queue.ts')
  const { loadContentSource } = await load<{ loadContentSource: () => Promise<ContentSource> }>('/src/content/source.ts')
  const { TEMPLATES } = await load<{ TEMPLATES: Readonly<Record<ConceptId, readonly QuestionTemplate[]>> }>(
    '/src/content/questions/templates.ts',
  )
  const { AUTHORED } = await load<{ AUTHORED: Readonly<Record<ConceptId, readonly Question[]>> }>(
    '/src/content/questions/authored.ts',
  )

  const source = await loadContentSource()
  const derived = Object.fromEntries(
    Object.entries(source.questions).map(([conceptId, pool]) => [
      conceptId,
      pool.filter((question) => question.provenance.origin === 'derived'),
    ]),
  )
  const findings = bank.screenQuestions({
    concepts: source.concepts,
    questions: source.questions,
    engine: bank.TEMPLATE_ENGINE,
    templates: TEMPLATES,
  })

  return {
    concepts: source.concepts,
    queue: queue.buildQueue({
      concepts: source.concepts,
      templates: TEMPLATES,
      authored: AUTHORED,
      derived,
      spotCheckOnly,
      includeReviewed,
    }),
    findingsFor: (id) => findings.filter((finding) => finding.questionId === id),
  }
}

await withModules(async (load) => {
  const queueApi = await load<typeof Queue>('/tools/review-queue.ts')
  let current = await snapshot(load)

  if (current.queue.length === 0) {
    console.log('review: nothing waiting. Everything has been cleared, or --all would show it again.')
    return
  }

  console.log(`review: ${current.queue.length} item(s) waiting, as ${reviewer}`)
  console.log(KEYS)

  let index = 0
  while (index < current.queue.length) {
    const item = current.queue[index]
    if (!item) break
    render(item, index, current)

    const key = await readKey()
    if (key === 'q') break
    if (key === 's') {
      index++
      continue
    }
    if (key === '?') {
      showLesson(item, current.concepts)
      continue
    }
    if (key === 'e') {
      edit(queueApi.sourceFileFor(item), queueApi.targetIdFor(item))
      current = await snapshot(load)
      const problems = current.findingsFor(item.id)
      console.log(problems.length === 0 ? '  re-screened: clean' : `  re-screened: ${describe(problems)}`)
      continue
    }

    const action = await actionFor(key)
    if (!action) continue

    const file = queueApi.sourceFileFor(item)
    const targetId = queueApi.targetIdFor(item)
    writeFileSync(file, queueApi.applyToSource(readFileSync(file, 'utf8'), targetId, action), 'utf8')
    appendLog(queueApi.entryFor(item, action, reviewer, new Date().toISOString()))
    console.log(`  ${action.kind} → ${file} (${targetId})`)

    // A template decision belongs to every instance it produced, so the bank is rewritten
    // with the new stamp rather than left to drift (§8).
    if (item.kind !== 'authored') {
      const files = await load<typeof BankFiles>('/tools/bank-files.ts')
      const result = files.regenerate()
      console.log(`  regenerated the bank: ${result.perConcept.map((each) => `${each.conceptId} ${each.generated}`).join(', ')}`)
      current = await snapshot(load)
    }
    index++
  }

  console.log(`\nreviewed up to item ${index} of ${current.queue.length}. Decisions are in ${LOG_FILE}.`)
})

function render(item: Queue.ReviewItem, index: number, state: Snapshot) {
  const findings = state.findingsFor(item.id)
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`[${index + 1}/${state.queue.length}] ${item.kind} · ${item.conceptId} · ${item.id}`)

  if (item.kind === 'template') {
    const { template } = item
    console.log(`  depth ${template.depth} · ${template.instanceCount} instances · ${template.reviewStatus} · ${template.status}`)
    console.log(`  parameters: ${template.params.map(describeParam).join('; ')}`)
    console.log('  distractors, each the consequence of one named mistake:')
    for (const rule of template.distractors) console.log(`    · ${rule.label}\n      ${rule.whyWrong}`)
    if (item.sample) {
      console.log('\n  one instance it produces:')
      renderQuestion(item.sample, '    ')
    }
  } else {
    const { question } = item
    console.log(`  depth ${question.depth} · ${question.kind.type} · tags ${question.tags.join(', ')}`)
    if (item.kind === 'instance') console.log(`  spot check of ${item.template.id}`)
    renderQuestion(question, '  ')
  }

  if (findings.length > 0) console.log(`\n  screener: ${describe(findings)}`)
  process.stdout.write(`${KEYS}\n> `)
}

function blockLine(block: Block): string {
  switch (block.kind) {
    case 'prose':
    case 'callout':
      return block.text
    case 'formula':
      return `${block.formula}\n    ${block.explanation}`
    case 'diagram':
      return `[diagram: ${block.architecture.nodes.map((node) => node.kind).join(' → ')}] ${block.caption}`
    case 'demo':
      return `[demo: ${block.demoId}]`
  }
}

function renderQuestion(question: Question, indent: string) {
  console.log(`\n${indent}${question.prompt}`)
  if (question.kind.type === 'numeric') {
    console.log(`${indent}  ✓ ${question.kind.answer}${question.kind.unit} (±${question.kind.tolerance})`)
  } else {
    const correct = question.kind.type === 'single' ? [question.kind.correctId] : question.kind.correctIds
    for (const option of question.kind.options) {
      console.log(`${indent}  ${correct.includes(option.id) ? '✓' : ' '} ${option.text}`)
      if (option.whyWrong) console.log(`${indent}      why wrong: ${option.whyWrong}`)
    }
  }
  console.log(`\n${indent}${question.explanation}`)
}

function describeParam(spec: QuestionTemplate['params'][number]): string {
  return spec.kind === 'choice' ? `${spec.name} ∈ {${spec.values.join(', ')}}` : `${spec.name} ${spec.min}–${spec.max} by ${spec.step}`
}

function describe(findings: readonly Bank.Finding[]): string {
  return findings.map((finding) => `${finding.severity}: ${finding.rule} — ${finding.detail}`).join('; ')
}

function showLesson(item: Queue.ReviewItem, concepts: readonly Concept[]) {
  const concept = concepts.find((each) => each.id === item.conceptId)
  if (!concept) return
  console.log(`\n  ── ${concept.title} ──`)
  for (const block of concept.lesson.core) console.log(`  ${blockLine(block)}\n`)
  for (const fact of concept.lesson.keyNumbers) console.log(`  · ${fact.label}: ${fact.value}`)
  process.stdout.write(`${KEYS}\n> `)
}

/** Opens the source file in $EDITOR and waits, so the re-screen sees what was saved. */
function edit(file: string, id: string) {
  const editor = process.env.VISUAL ?? process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi')
  console.log(`  opening ${file} in ${editor} — find ${id}`)
  spawnSync(editor, [file], { stdio: 'inherit', shell: true })
}

async function actionFor(key: string): Promise<Queue.ReviewAction | null> {
  if (key === 'a') return { kind: 'approve' }
  if (key === 'f') return { kind: 'flag' }
  if (key !== 'r') return null
  const reason = (await askLine('  reason for rejecting: ')).trim()
  if (reason === '') {
    console.log('  rejection needs a reason; nothing was written.')
    return null
  }
  return { kind: 'reject', reason }
}

function appendLog(entry: Queue.LogEntry) {
  mkdirSync(dirname(LOG_FILE), { recursive: true })
  appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
}

/**
 * One keypress, without waiting for Enter. Ctrl+C still quits, and a closed stdin ends the
 * session rather than hanging — which is what happens when the tool is run non-interactively.
 */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const finish = (key: string) => {
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false)
      stdin.pause()
      resolve(key)
    }
    // Piped input arrives in one chunk, so only the first character counts as the keypress.
    const onData = (chunk: string) => {
      const key = chunk.slice(0, 1)
      if (key === '') process.exit(130)
      console.log(key)
      finish(key)
    }
    const onEnd = () => finish('q')

    stdin.on('data', onData)
    stdin.on('end', onEnd)
  })
}

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(prompt)
  } finally {
    rl.close()
  }
}
