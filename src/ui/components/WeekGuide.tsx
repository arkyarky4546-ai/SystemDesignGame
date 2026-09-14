import { Fragment, useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Term, TermGroup } from './Term'
import { WEEK_GUIDE, type GuidePart } from './week-guide-copy'

const BUTTON = 'shrink-0 rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow'

type WeekGuideProps = {
  /** The id the header's button controls. */
  readonly id: string
  /**
   * Moves focus to the heading as the guide opens. For a guide the player asked for: below
   * 900px it opens under the canvas, far from the header's button in tab order.
   */
  readonly focusHeading: boolean
  /** Closes the guide from inside it, by its button or Escape. */
  readonly onClose: () => void
}

/**
 * "How a week works" (M4a, ADR-0038): the smallest help that lets a new player run one week.
 * It sits beside the canvas instead of over it, so the player can look at what each step names
 * while reading, and nothing on the page is blocked. The canvas screen decides where it goes.
 */
export function WeekGuide({ id, focusHeading, onClose }: WeekGuideProps) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)

  // The guide opens by mounting, so this runs once per opening.
  useEffect(() => {
    if (focusHeading) heading.current?.focus()
  }, [focusHeading])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <section id={id} aria-labelledby={headingId} onKeyDown={onKeyDown} className="bg-panel-raised px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} ref={heading} tabIndex={-1} className="text-base font-semibold text-ink-bright">
            {WEEK_GUIDE.title}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm">{WEEK_GUIDE.lead}</p>
        </div>
        <button type="button" className={BUTTON} onClick={onClose}>
          Close guide
        </button>
      </div>
      <TermGroup className="mt-3">
        <ol className="grid gap-x-6 gap-y-3 min-[600px]:grid-cols-2 min-[1280px]:grid-cols-5">
          {WEEK_GUIDE.steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ink-bright">
                <span className="num">{index + 1}</span> {step.title}
              </h3>
              <p className="text-sm leading-relaxed">{step.body.map(renderPart)}</p>
            </li>
          ))}
        </ol>
      </TermGroup>
    </section>
  )
}

function renderPart(part: GuidePart, index: number) {
  if (typeof part === 'string') return <Fragment key={index}>{part}</Fragment>
  return (
    <b key={index} data-guide-label={part.text} className="font-medium text-ink-bright">
      {part.kind === 'term' ? <Term id={part.term}>{part.text}</Term> : part.text}
    </b>
  )
}
