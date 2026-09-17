// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { BALANCE } from '../config/balance'
import { CONCEPTS } from '../content/concepts'
import { loadQuestions } from '../content/questions'
import type { Question } from '../content/schema'
import type { Knowledge, RunState } from '../engine'
import { CONTENT_CATALOG } from '../state/catalog'
import { drawCheck } from '../state/check'
import { createGameStore } from '../state/store'
import { FIXED_NOW, memoryStorage } from '../state/test-helpers'
import { App } from './App'
import { formatDollars } from './format'

afterEach(cleanup)

const CONCEPT = CONCEPTS['capacity-and-utilization']
const SEED = 1
const NOTHING_LEARNED: Knowledge = { unlockedConcepts: [], checkHistory: [] }
// The same pool the screen loads: the authored batch plus the frozen derived bank.
const POOL = await loadQuestions('capacity-and-utilization')

function setup() {
  const store = createGameStore({ storage: memoryStorage(), catalog: CONTENT_CATALOG, now: FIXED_NOW })
  store.getState().startRun(SEED)
  store.setState({ settings: { ...store.getState().settings, reducedMotion: true } })
  render(<App store={store} />)
  const run = (): RunState => {
    const current = store.getState().run
    if (!current) throw new Error('expected a run')
    return current
  }
  return { store, run, user: userEvent.setup() }
}

const status = () => screen.getByLabelText('Run status')
const canvas = () => screen.getByRole('application', { name: 'Architecture canvas' })
const inspector = () => screen.getByRole('region', { name: 'App server' })
const sizeSelect = () => within(inspector()).getByLabelText('Size') as HTMLSelectElement

/** Selects the starter app server on the canvas with the keyboard alone. */
async function selectAppServer(user: ReturnType<typeof userEvent.setup>) {
  canvas().focus()
  await user.keyboard('{ArrowDown}{ArrowDown}')
}

/**
 * What this attempt asks, computed the same way the screen computes it. The knowledge
 * matters: a retake after a failure weights the missed questions up, so it has to be the
 * knowledge the attempt opened with.
 */
function drawnQuestions(attemptNumber: number, knowledge: Knowledge = NOTHING_LEARNED) {
  return drawCheck({
    pool: POOL,
    conceptId: CONCEPT.id,
    drawCount: CONCEPT.check.drawCount,
    difficulty: 'junior',
    knowledge,
    seed: SEED,
    attemptNumber,
  })
}

/**
 * Answers the question on screen, correctly or deliberately wrongly, and returns the option
 * ids that ended up selected. A single-choice question keeps only the last click, so a wrong
 * answer there is one option rather than all of them.
 */
async function answer(
  user: ReturnType<typeof userEvent.setup>,
  question: Question,
  correctly: boolean,
): Promise<readonly string[]> {
  const kind = question.kind
  if (kind.type === 'numeric') {
    const field = screen.getByRole('spinbutton')
    await user.clear(field)
    await user.type(field, String(correctly ? kind.answer : kind.answer + kind.tolerance + 1))
    return []
  }
  const correct = kind.type === 'single' ? [kind.correctId] : [...kind.correctIds]
  const wanted = correctly ? correct : kind.options.filter((option) => !correct.includes(option.id)).map((option) => option.id)
  for (const id of wanted) {
    const option = kind.options.find((each) => each.id === id)
    if (!option) throw new Error(`no option ${id} on ${question.id}`)
    await user.click(screen.getByText(option.text))
  }
  return kind.type === 'single' ? wanted.slice(-1) : wanted
}

/** Runs the whole check, answering every question the same way. Leaves the result on screen. */
async function takeCheck(
  user: ReturnType<typeof userEvent.setup>,
  attemptNumber: number,
  correctly: boolean,
  knowledge: Knowledge = NOTHING_LEARNED,
) {
  const questions = drawnQuestions(attemptNumber, knowledge)
  for (const [index, question] of questions.entries()) {
    await screen.findByText(question.prompt)
    expect(screen.getByText(`Question ${index + 1} of ${questions.length}`, { exact: false })).toBeTruthy()

    await answer(user, question, correctly)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    // The explanation always shows, right or wrong, before anything moves on.
    expect(screen.getByText(question.explanation)).toBeTruthy()
    const last = index === questions.length - 1
    await user.click(screen.getByRole('button', { name: last ? 'See your score' : 'Next question' }))
  }
  return questions
}

describe('M4b: one playable concept', () => {
  it('locks app server sizes above Small on a new run and names what unlocks them', async () => {
    const { user } = setup()
    await selectAppServer(user)

    const options = within(sizeSelect()).getAllByRole('option') as HTMLOptionElement[]
    expect(options[0]?.textContent).toContain('Small')
    expect(options[0]?.disabled).toBe(false)
    for (const option of options.slice(1)) {
      expect(option.disabled, option.textContent ?? '').toBe(true)
      expect(option.textContent).toContain('locked')
    }

    expect(screen.getByText(/Medium, Large and Extra large need Capacity, utilization, and the cliff\./)).toBeTruthy()
  })

  it('opens the lesson from the inspector with the mouse', async () => {
    const { user } = setup()
    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))
    expect(screen.getByRole('heading', { name: CONCEPT.title })).toBeTruthy()
  })

  it('opens the lesson from the inspector with the keyboard alone', async () => {
    const { user } = setup()
    await selectAppServer(user)
    screen.getByRole('button', { name: 'Open the lesson' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: CONCEPT.title })).toBeTruthy()
  })

  it('shows the lesson’s prose, key numbers and misconceptions, then offers the check', async () => {
    const { user } = setup()
    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))

    for (const block of CONCEPT.lesson.core) {
      if (block.kind === 'prose' || block.kind === 'callout') expect(screen.getByText(block.text)).toBeTruthy()
    }
    expect(screen.getByRole('heading', { name: 'Worth remembering' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Commonly believed, and wrong' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Take the check' })).toBeTruthy()
  })

  it('asks one question at a time and shows the chosen option’s whyWrong before moving on', async () => {
    const { user } = setup()
    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))
    await user.click(screen.getByRole('button', { name: 'Take the check' }))

    const [first] = drawnQuestions(1)
    if (!first) throw new Error('expected a drawn question')
    await screen.findByText(first.prompt)

    // Only the current question is on screen.
    const questions = drawnQuestions(1)
    for (const other of questions.slice(1)) expect(screen.queryByText(other.prompt)).toBeNull()

    const chosen = await answer(user, first, false)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(screen.getByText('Not quite')).toBeTruthy()
    expect(screen.getByText(first.explanation)).toBeTruthy()

    // Only the option the player actually chose explains itself, not every wrong one.
    if (first.kind.type !== 'numeric') {
      const options = first.kind.options
      for (const option of options) {
        if (!option.whyWrong) continue
        const shown = screen.queryByText(option.whyWrong)
        expect(Boolean(shown), `${option.id} whyWrong`).toBe(chosen.includes(option.id))
      }
      expect(chosen.length).toBeGreaterThan(0)
    }
  })

  it('fails below the threshold and offers Reread the lesson and Retake', async () => {
    const { user, store } = setup()
    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))
    await user.click(screen.getByRole('button', { name: 'Take the check' }))
    await takeCheck(user, 1, false)

    expect(screen.getByText(`0 of ${CONCEPT.check.drawCount} — you need 3.5 on Junior.`)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reread the lesson' })).toBeTruthy()

    // Nothing is unlocked and nothing is paid.
    expect(store.getState().knowledge.unlockedConcepts).toEqual([])
    expect(store.getState().run?.cashCents).toBe(BALANCE.economy.startingCashCents.junior)

    // Retake draws a different set, weighted towards what was missed.
    const learned = store.getState().knowledge
    await user.click(screen.getByRole('button', { name: 'Retake' }))
    const second = drawnQuestions(2, learned)
    const first = drawnQuestions(1)
    expect(second.map((question) => question.id)).not.toEqual(first.map((question) => question.id))
    await screen.findByText(second[0]?.prompt ?? '')
  })

  it('passes, unlocks the sizes, pays the bonus once, and states it in the status bar and the report', async () => {
    const { user, store, run } = setup()
    const startingCash = run().cashCents

    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))
    await user.click(screen.getByRole('button', { name: 'Take the check' }))
    await takeCheck(user, 1, true)

    const bonus = BALANCE.knowledge.firstPassBonusCents
    expect(screen.getByText(`${CONCEPT.check.drawCount} of ${CONCEPT.check.drawCount} — you need 3.5 on Junior.`)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Passed\\..*${formatDollars(bonus).replace('$', '\\$')} is paid into this run`))).toBeTruthy()

    // The unlock and the bonus reached the store, and the bonus is integer cents.
    expect(store.getState().knowledge.unlockedConcepts).toEqual([CONCEPT.id])
    expect(run().cashCents).toBe(startingCash + bonus)
    expect(Number.isSafeInteger(bonus)).toBe(true)

    // The status bar shows the cash the bonus produced.
    expect(within(status()).getByText(formatDollars(startingCash + bonus))).toBeTruthy()

    // Back on the canvas, the sizes are choosable.
    await user.click(screen.getByRole('button', { name: 'Back to canvas' }))
    await selectAppServer(user)
    for (const option of within(sizeSelect()).getAllByRole('option') as HTMLOptionElement[]) {
      expect(option.disabled, option.textContent ?? '').toBe(false)
      expect(option.textContent).not.toContain('locked')
    }

    // The next weekly report states the bonus.
    await user.click(screen.getByRole('button', { name: 'Advance week' }))
    const dialog = await screen.findByRole('dialog', { name: 'Week 1' })
    expect(within(dialog).getByText('Learning bonus')).toBeTruthy()
    expect(within(dialog).getByText(/Paid when you passed a check/)).toBeTruthy()
  })

  it('pays nothing for a retake after passing, and keeps the unlock', async () => {
    const { user, store, run } = setup()
    await selectAppServer(user)
    await user.click(screen.getByRole('button', { name: 'Open the lesson' }))
    await user.click(screen.getByRole('button', { name: 'Take the check' }))
    await takeCheck(user, 1, true)

    const afterFirst = run().cashCents
    const learned = store.getState().knowledge
    await user.click(screen.getByRole('button', { name: 'Reread the lesson' }))
    await user.click(screen.getByRole('button', { name: 'Take the check' }))
    await takeCheck(user, 2, true, learned)

    await waitFor(() => expect(store.getState().knowledge.checkHistory).toHaveLength(2))
    expect(run().cashCents).toBe(afterFirst)
    expect(store.getState().knowledge.unlockedConcepts).toEqual([CONCEPT.id])
  })
})
