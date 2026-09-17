import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Difficulty } from '../../../config/difficulty'
import { CONCEPTS } from '../../../content/concepts'
import { loadQuestions } from '../../../content/questions'
import type { ConceptId, Question } from '../../../content/schema'
import type { CheckAttempt, Knowledge } from '../../../engine'
import { attemptFrom, drawCheck, passThreshold, scoreCheck, type Answer, type CheckOutcome } from '../../../state/check'
import { tiersUnlockedBy } from '../../../state/unlocks'
import { formatDollars } from '../../format'
import { CHECK, FAILED_LEAD, depthLabel, formatScore, passedLine, questionPosition, scoreLine } from './learning-copy'
import { QuestionView, whyWrongFor } from './QuestionView'

type CheckScreenProps = {
  readonly conceptId: ConceptId
  /** Which attempt this is. It seeds the draw and the option order, so a replay matches. */
  readonly attemptNumber: number
  readonly difficulty: Difficulty
  readonly knowledge: Knowledge
  /** The run's seed. Two runs draw different questions for the same attempt number. */
  readonly seed: number
  /** Records the finished attempt and returns the bonus paid, in integer cents. */
  readonly onRecord: (attempt: CheckAttempt) => number
  readonly onRetake: () => void
  readonly onRereadLesson: () => void
  readonly onClose: () => void
}

const PRIMARY = 'rounded bg-flow px-4 py-2 text-sm font-medium text-panel-void hover:bg-ink-bright disabled:opacity-50'
const SECONDARY = 'rounded border border-panel-line px-3 py-2 text-sm text-ink-bright hover:border-flow'

type Finished = { readonly outcome: CheckOutcome; readonly bonusCents: number }

/**
 * The check screen (05-UI-DESIGN §7): one question at a time, then the explanation and the
 * chosen option's `whyWrong` before moving on, then the score against the difficulty's
 * threshold. Failing costs nothing but the week — Reread the lesson and Retake are both one
 * press away, and there is no cooldown.
 *
 * The questions load as their own chunk (09-QUESTION-BANK §4.2), so nothing about this
 * concept's bank is in the initial bundle.
 */
export function CheckScreen(props: CheckScreenProps) {
  const { conceptId, attemptNumber, difficulty, knowledge, seed } = props
  const concept = CONCEPTS[conceptId]
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)

  const [pool, setPool] = useState<readonly Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>({})
  const [draft, setDraft] = useState<Answer | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState<Finished | null>(null)

  useEffect(() => {
    let current = true
    void loadQuestions(conceptId).then((questions) => {
      if (current) setPool(questions)
    })
    return () => {
      current = false
    }
  }, [conceptId])

  useEffect(() => heading.current?.focus(), [attemptNumber])

  // The draw reads the knowledge this attempt opened with. Recording the attempt adds to
  // `checkHistory`, and re-drawing on that would swap the questions out from under the
  // result screen. A retake is a new attempt number, which remounts this component.
  const knowledgeAtOpen = useRef(knowledge).current

  const questions = useMemo(
    () =>
      pool
        ? drawCheck({
            pool,
            conceptId,
            drawCount: concept.check.drawCount,
            difficulty,
            knowledge: knowledgeAtOpen,
            seed,
            attemptNumber,
          })
        : [],
    [pool, conceptId, concept.check.drawCount, difficulty, knowledgeAtOpen, seed, attemptNumber],
  )

  if (!pool) {
    return (
      <Shell headingId={headingId} heading={heading} title={concept.title}>
        {CHECK.loading}
      </Shell>
    )
  }
  if (questions.length === 0) {
    return (
      <Shell headingId={headingId} heading={heading} title={concept.title}>
        {CHECK.empty}
      </Shell>
    )
  }

  if (finished) {
    return <Result {...props} headingId={headingId} heading={heading} finished={finished} questions={questions} answers={answers} />
  }

  const question = questions[index]
  if (!question) return null
  const last = index === questions.length - 1

  const submit = () => {
    if (!draft) return
    setAnswers((current) => ({ ...current, [question.id]: draft }))
    setRevealed(true)
  }

  const advance = () => {
    const recorded = { ...answers, [question.id]: draft } as Readonly<Record<string, Answer>>
    if (!last) {
      setIndex(index + 1)
      setDraft(null)
      setRevealed(false)
      return
    }
    const outcome = scoreCheck(questions, recorded, difficulty)
    const bonusCents = props.onRecord(attemptFrom(conceptId, attemptNumber, outcome))
    setFinished({ outcome, bonusCents })
  }

  return (
    <Shell headingId={headingId} heading={heading} title={concept.title}>
      <p className="text-xs">
        {questionPosition(index, questions.length)} · {depthLabel(question.depth)}
      </p>

      <QuestionView question={question} attemptNumber={attemptNumber} draft={draft} revealed={revealed} onChange={setDraft} />

      <div className="flex flex-wrap items-center gap-2">
        {revealed ? (
          <button type="button" className={PRIMARY} onClick={advance}>
            {last ? CHECK.finish : CHECK.next}
          </button>
        ) : (
          <button type="button" className={PRIMARY} disabled={draft === null} onClick={submit}>
            {CHECK.submit}
          </button>
        )}
        <button type="button" className={SECONDARY} onClick={props.onClose}>
          {CHECK.backToCanvas}
        </button>
      </div>
    </Shell>
  )
}

/** One column at a reading measure, with the concept's title at the top. Shared by every learning screen. */
export function Shell({
  headingId,
  heading,
  title,
  children,
}: {
  readonly headingId: string
  readonly heading: RefObject<HTMLHeadingElement | null>
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <section aria-labelledby={headingId} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-[68ch] flex-col gap-4">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="text-2xl font-semibold text-ink-bright">
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

function Result(
  props: CheckScreenProps & {
    readonly headingId: string
    readonly heading: RefObject<HTMLHeadingElement | null>
    readonly finished: Finished
    readonly questions: readonly Question[]
    readonly answers: Readonly<Record<string, Answer>>
  },
) {
  const { finished, questions, answers, difficulty, conceptId } = props
  const concept = CONCEPTS[conceptId]
  const needed = passThreshold(difficulty) * finished.outcome.total
  const unlocked = tiersUnlockedBy(conceptId).map((tier) => `${tier.label} ${tier.displayName.toLowerCase()}`)
  const missed = questions.filter((question) => finished.outcome.missedQuestionIds.includes(question.id))

  return (
    <Shell headingId={props.headingId} heading={props.heading} title={concept.title}>
      <div aria-live="polite" className="flex flex-col gap-2">
        <p className="num text-xl text-ink-bright">{scoreLine(finished.outcome.score, finished.outcome.total, needed, difficulty)}</p>
        <p className="text-sm leading-relaxed">
          {finished.outcome.passed
            ? passedLine(unlocked, finished.bonusCents > 0 ? formatDollars(finished.bonusCents) : null)
            : FAILED_LEAD}
        </p>
      </div>

      {missed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink-bright">
            {missed.length === 1 ? 'The one you missed' : `The ${formatScore(missed.length)} you missed`}
          </h3>
          <ul className="flex flex-col gap-2">
            {missed.map((question) => (
              <li key={question.id} className="border-l-2 border-panel-line pl-3 text-sm leading-relaxed">
                <p className="text-ink-bright">{question.prompt}</p>
                <p className="mt-1">{question.explanation}</p>
                {whyWrongFor(question, answers[question.id] ?? null).map((why, position) => (
                  <p key={position} className="mt-1">
                    {why}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-panel-line pt-4">
        {!finished.outcome.passed && (
          <button type="button" className={PRIMARY} onClick={props.onRetake}>
            {CHECK.retake}
          </button>
        )}
        <button type="button" className={finished.outcome.passed ? PRIMARY : SECONDARY} onClick={props.onClose}>
          {CHECK.backToCanvas}
        </button>
        <button type="button" className={SECONDARY} onClick={props.onRereadLesson}>
          {CHECK.backToLesson}
        </button>
      </div>
    </Shell>
  )
}
