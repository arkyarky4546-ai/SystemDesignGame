import { useId, useMemo } from 'react'
import type { Option, Question } from '../../../content/schema'
import { gradeAnswer, shuffledOptions, type Answer } from '../../../state/check'
import { CHECK } from './learning-copy'

const FIELD = 'rounded border border-panel-line bg-panel-void px-2 py-1 text-sm text-ink-bright'

type QuestionViewProps = {
  readonly question: Question
  /**
   * Seeds the option order. The same question in the same attempt always shows its options
   * in the same order, and the stored files keep their authoring order (09-QUESTION-BANK §6).
   */
  readonly attemptNumber: number
  readonly draft: Answer | null
  /** True once the answer has been checked: the inputs lock and the explanation appears. */
  readonly revealed: boolean
  readonly onChange: (answer: Answer | null) => void
}

/**
 * One question, from its prompt to its explanation (05-UI-DESIGN §7). Shared by the check and
 * by practice mode, so what a question looks like never depends on why you're answering it.
 *
 * After answering, the explanation always shows — right or wrong — and a wrong answer also
 * shows the `whyWrong` of the option that was actually chosen. That is where most of the
 * teaching happens, so it names the misunderstanding rather than restating the answer.
 */
export function QuestionView({ question, attemptNumber, draft, revealed, onChange }: QuestionViewProps) {
  const promptId = useId()
  const name = useId()
  const hintId = `${name}-hint`
  const options = useMemo(() => shuffledOptions(question, attemptNumber), [question, attemptNumber])
  const grade = revealed ? gradeAnswer(question, draft) : null
  const kind = question.kind

  return (
    <>
      <p id={promptId} className="text-base leading-relaxed text-ink-bright">
        {question.prompt}
      </p>

      {kind.type === 'numeric' ? (
        <div className="flex flex-col gap-1 text-sm">
          <p id={hintId}>{CHECK.numericHint}</p>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              disabled={revealed}
              aria-labelledby={promptId}
              aria-describedby={hintId}
              className={`${FIELD} num w-40`}
              value={draft?.kind === 'numeric' ? String(draft.value) : ''}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                onChange(event.target.value === '' || Number.isNaN(parsed) ? null : { kind: 'numeric', value: parsed })
              }}
            />
            <span className="num text-sm text-ink-bright">{kind.unit}</span>
          </span>
        </div>
      ) : (
        <fieldset disabled={revealed} aria-labelledby={promptId} className="flex flex-col gap-2">
          {kind.type === 'multi' && <p className="text-sm">{CHECK.multiHint}</p>}
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-start gap-2 text-sm leading-relaxed">
              <input
                type={kind.type === 'multi' ? 'checkbox' : 'radio'}
                name={name}
                className="mt-1 accent-flow"
                checked={isChosen(draft, option.id)}
                onChange={(event) => {
                  if (kind.type === 'single') {
                    onChange({ kind: 'single', optionId: option.id })
                    return
                  }
                  const chosen = draft?.kind === 'multi' ? draft.optionIds : []
                  const next = event.target.checked ? [...chosen, option.id] : chosen.filter((id) => id !== option.id)
                  onChange(next.length === 0 ? null : { kind: 'multi', optionIds: next })
                }}
              />
              <span>{option.text}</span>
            </label>
          ))}
        </fieldset>
      )}

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
    </>
  )
}

function isChosen(draft: Answer | null, optionId: string): boolean {
  if (draft?.kind === 'multi') return draft.optionIds.includes(optionId)
  return draft?.kind === 'single' && draft.optionId === optionId
}

/** "Correct", "Partly right" or "Not quite", from the score a question earned, 0..1. */
export function verdict(score: number): string {
  if (score === 1) return CHECK.correct
  return score > 0 ? CHECK.partial : CHECK.incorrect
}

/**
 * Why each wrong option the player chose was wrong (05-UI-DESIGN §7). A numeric question has
 * no options, so it states the answer instead.
 */
export function whyWrongFor(question: Question, answer: Answer | null): readonly string[] {
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
