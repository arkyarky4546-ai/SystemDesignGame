import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CONCEPTS } from '../../../content/concepts'
import { loadQuestions } from '../../../content/questions'
import type { ConceptId, Question } from '../../../content/schema'
import type { Knowledge } from '../../../engine'
import { drawPractice, gradeAnswer, type Answer } from '../../../state/check'
import { PRACTICE } from '../library/library-copy'
import { Shell } from './CheckScreen'
import { depthLabel } from './learning-copy'
import { QuestionView } from './QuestionView'

type PracticeScreenProps = {
  readonly conceptId: ConceptId
  readonly knowledge: Knowledge
  /** Seeds the draw. A run's practice differs from another run's. */
  readonly seed: number
  readonly onRereadLesson: () => void
  readonly onClose: () => void
}

const PRIMARY = 'rounded bg-flow px-4 py-2 text-sm font-medium text-panel-void hover:bg-ink-bright disabled:opacity-50'
const SECONDARY = 'rounded border border-panel-line px-3 py-2 text-sm text-ink-bright hover:border-flow'

/** How many questions one practice round draws before it needs another. */
const ROUND_SIZE = 10

/**
 * Practice mode (09-QUESTION-BANK §9): pick a concept, answer questions until you stop. No
 * gating, no pass threshold, and no effect on unlocks or cash (ADR-0040) — so there is
 * nothing here to farm, and nothing to lose by being wrong.
 *
 * It draws from the full active pool at every depth, weighted by what past attempts missed,
 * rather than from the difficulty's eligible depths: practice is where you go to meet the
 * questions your difficulty doesn't ask you.
 */
export function PracticeScreen({ conceptId, knowledge, seed, onRereadLesson, onClose }: PracticeScreenProps) {
  const concept = CONCEPTS[conceptId]
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)

  const [pool, setPool] = useState<readonly Question[] | null>(null)
  const [round, setRound] = useState(0)
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Answer | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState({ right: 0, asked: 0 })

  useEffect(() => {
    let current = true
    void loadQuestions(conceptId).then((questions) => {
      if (current) setPool(questions)
    })
    return () => {
      current = false
    }
  }, [conceptId])

  useEffect(() => heading.current?.focus(), [conceptId])

  const questions = useMemo(
    () => (pool ? drawPractice({ pool, conceptId, count: ROUND_SIZE, knowledge, seed, round }) : []),
    // `knowledge` is read once per round: nothing here writes to it, so it can't change mid-round.
    [pool, conceptId, knowledge, seed, round],
  )

  const title = PRACTICE.title(concept.title)
  if (!pool) {
    return (
      <Shell headingId={headingId} heading={heading} title={title}>
        {PRACTICE.loading}
      </Shell>
    )
  }
  if (questions.length === 0) {
    return (
      <Shell headingId={headingId} heading={heading} title={title}>
        {PRACTICE.empty}
      </Shell>
    )
  }

  const question = questions[index]
  if (!question) return null

  const submit = () => {
    if (!draft) return
    setRevealed(true)
    setTally((current) => ({ right: current.right + (gradeAnswer(question, draft).correct ? 1 : 0), asked: current.asked + 1 }))
  }

  const next = () => {
    setDraft(null)
    setRevealed(false)
    // A finished round draws another, so practice runs until the player stops it.
    if (index + 1 < questions.length) setIndex(index + 1)
    else {
      setRound(round + 1)
      setIndex(0)
    }
  }

  return (
    <Shell headingId={headingId} heading={heading} title={title}>
      <p className="text-sm">{PRACTICE.lead}</p>
      <p className="text-xs" aria-live="polite">
        {PRACTICE.tally(tally.right, tally.asked)} · {depthLabel(question.depth)}
      </p>

      <QuestionView question={question} attemptNumber={round} draft={draft} revealed={revealed} onChange={setDraft} />

      <div className="flex flex-wrap items-center gap-2 border-t border-panel-line pt-4">
        {revealed ? (
          <button type="button" className={PRIMARY} onClick={next}>
            {PRACTICE.next}
          </button>
        ) : (
          <button type="button" className={PRIMARY} disabled={draft === null} onClick={submit}>
            {PRACTICE.submit}
          </button>
        )}
        <button type="button" className={SECONDARY} onClick={onClose}>
          {PRACTICE.done}
        </button>
        <button type="button" className={SECONDARY} onClick={onRereadLesson}>
          {PRACTICE.backToLesson}
        </button>
      </div>
    </Shell>
  )
}
