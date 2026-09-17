import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Difficulty } from '../../../config/difficulty'
import { CONCEPTS } from '../../../content/concepts'
import { loadQuestions } from '../../../content/questions'
import type { ConceptId, Option, Question } from '../../../content/schema'
import type { CheckAttempt, Knowledge } from '../../../engine'
import {
  attemptFrom,
  drawCheck,
  gradeAnswer,
  passThreshold,
  scoreCheck,
  type Answer,
  type CheckOutcome,
} from '../../../state/check'
import { tiersUnlockedBy } from '../../../state/unlocks'
import { formatDollars } from '../../format'
import { CHECK, FAILED_LEAD, depthLabel, formatScore, passedLine, questionPosition, scoreLine } from './learning-copy'

type CheckScreenProps = {
  readonly conceptId: ConceptId
  /** Which attempt this is. It seeds the draw, so the same attempt replays identically. */
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
const FIELD = 'rounded border border-panel-line bg-panel-void px-2 py-1 text-sm text-ink-bright'

type Finished = { readonly outcome: CheckOutcome; readonly bonusCents: number }

/**
 * The check screen (05-UI-DESIGN §7): one question at a time, then the explanation and the
 * chosen option's `whyWrong` before moving on, then the score against the difficulty's
 * threshold. Failing costs nothing but the week — Reread the lesson and Retake are both
 * one press away, and there is no cooldown.
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

  // A new attempt is a new draw and a fresh set of answers.
  useEffect(() => {
    setIndex(0)
    setAnswers({})
    setDraft(null)
    setRevealed(false)
    setFinished(null)
  }, [attemptNumber])

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

  if (!pool) return <Shell headingId={headingId} heading={heading} title={concept.title}>{CHECK.loading}</Shell>
  if (questions.length === 0) return <Shell headingId={headingId} heading={heading} title={concept.title}>{CHECK.empty}</Shell>

  if (finished) {
    return (
      <Result
        {...props}
        headingId={headingId}
        heading={heading}
        finished={finished}
        questions={questions}
        answers={answers}
      />
    )
  }

  const question = questions[index]
  if (!question) return null
  const last = index === questions.length - 1
  const grade = revealed ? gradeAnswer(question, draft) : null

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
      <p id={`${headingId}-prompt`} className="text-base leading-relaxed text-ink-bright">
        {question.prompt}
      </p>

      <QuestionInput
        question={question}
        draft={draft}
        disabled={revealed}
        labelledBy={`${headingId}-prompt`}
        onChange={setDraft}
      />

      <div aria-live="polite" className="flex flex-col gap-2">
        {grade && (
          <div className={`border-l-2 pl-3 ${grade.correct ? 'border-ledger' : 'border-fault'}`}>
            <p className="text-sm font-medium text-ink-bright">{verdict(grade.score)}</p>
            <p className="mt-1 text-sm leading-relaxed">{question.explanation}</p>
            {whyWrongFor(question, draft).map((why, position) => (
              <p key={position} className="mt-2 text-sm leading-relaxed text-ink-bright">
                {why}
              </p>
            ))}
          </div>
        )}
      </div>

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

function Shell({
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

/**
 * The controls for one question. The prompt above them is the group's label, referenced
 * rather than repeated, so a screen reader reads it once.
 */
function QuestionInput({
  question,
  draft,
  disabled,
  labelledBy,
  onChange,
}: {
  readonly question: Question
  readonly draft: Answer | null
  readonly disabled: boolean
  readonly labelledBy: string
  readonly onChange: (answer: Answer | null) => void
}) {
  const name = useId()
  const hintId = `${name}-hint`
  const kind = question.kind

  if (kind.type === 'numeric') {
    const value = draft?.kind === 'numeric' ? draft.value : ''
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p id={hintId}>{CHECK.numericHint}</p>
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            disabled={disabled}
            aria-labelledby={labelledBy}
            aria-describedby={hintId}
            className={`${FIELD} num w-40`}
            value={value === '' ? '' : String(value)}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              onChange(event.target.value === '' || Number.isNaN(parsed) ? null : { kind: 'numeric', value: parsed })
            }}
          />
          <span className="num text-sm text-ink-bright">{kind.unit}</span>
        </span>
      </div>
    )
  }

  const chosen = draft?.kind === 'multi' ? draft.optionIds : []
  return (
    <fieldset disabled={disabled} aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {kind.type === 'multi' && <p className="text-sm">{CHECK.multiHint}</p>}
      {kind.options.map((option) => (
        <label key={option.id} className="flex cursor-pointer items-start gap-2 text-sm leading-relaxed">
          <input
            type={kind.type === 'multi' ? 'checkbox' : 'radio'}
            name={name}
            className="mt-1 accent-flow"
            checked={kind.type === 'multi' ? chosen.includes(option.id) : draft?.kind === 'single' && draft.optionId === option.id}
            onChange={(event) => {
              if (kind.type === 'single') {
                onChange({ kind: 'single', optionId: option.id })
                return
              }
              const next = event.target.checked ? [...chosen, option.id] : chosen.filter((id) => id !== option.id)
              onChange(next.length === 0 ? null : { kind: 'multi', optionIds: next })
            }}
          />
          <span>{option.text}</span>
        </label>
      ))}
    </fieldset>
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
        <p className="num text-xl text-ink-bright">
          {scoreLine(finished.outcome.score, finished.outcome.total, needed, difficulty)}
        </p>
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

/** "Correct", "Partly right" or "Not quite", from the score a question earned, 0..1. */
function verdict(score: number): string {
  if (score === 1) return CHECK.correct
  return score > 0 ? CHECK.partial : CHECK.incorrect
}

/**
 * Why each wrong option the player chose was wrong (05-UI-DESIGN §7). This is where most of
 * the teaching happens, so it names the specific misunderstanding rather than restating the
 * right answer. A numeric question has no options, so it states the answer instead.
 */
function whyWrongFor(question: Question, answer: Answer | null): readonly string[] {
  const kind = question.kind
  if (kind.type === 'numeric') {
    if (!answer || answer.kind !== 'numeric') return []
    return Math.abs(answer.value - kind.answer) <= kind.tolerance ? [] : [`The answer is ${kind.answer}${kind.unit}.`]
  }
  const chosen = answer?.kind === 'single' ? [answer.optionId] : answer?.kind === 'multi' ? answer.optionIds : []
  const correct = kind.type === 'single' ? [kind.correctId] : kind.correctIds
  return kind.options
    .filter((option: Option) => chosen.includes(option.id) && !correct.includes(option.id))
    .flatMap((option: Option) => (option.whyWrong ? [option.whyWrong] : []))
}
