import { useEffect, useId, useRef } from 'react'
import { CONCEPTS } from '../../../content/concepts'
import type { Block, ConceptId } from '../../../content/schema'
import type { PricedCatalog } from '../../../engine'
import { LESSON } from './learning-copy'
import { LessonDiagram } from './LessonDiagram'
import { DemoWidget } from './SaturationDemo'

type LessonScreenProps = {
  readonly conceptId: ConceptId
  /** The tiers a demo resolves against, so its slider shows the game's own figures. */
  readonly catalog: PricedCatalog
  readonly onTakeCheck: () => void
  readonly onClose: () => void
  /** Offered when there are questions to drill without a check (09-QUESTION-BANK §9). */
  readonly onPractice?: () => void
}

const PRIMARY = 'rounded bg-flow px-4 py-2 text-sm font-medium text-panel-void hover:bg-ink-bright'
const SECONDARY = 'rounded border border-panel-line px-3 py-2 text-sm text-ink-bright hover:border-flow'

/**
 * The lesson screen (05-UI-DESIGN §6): one column at a 68-character measure, no sidebar,
 * and a single primary action at the bottom. Reading needs quiet, so nothing else competes
 * with the prose. `diagram` and `demo` blocks arrive in M6 with the renderers for them.
 */
export function LessonScreen({ conceptId, catalog, onTakeCheck, onClose, onPractice }: LessonScreenProps) {
  const concept = CONCEPTS[conceptId]
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => heading.current?.focus(), [conceptId])

  return (
    <section aria-labelledby={headingId} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-[68ch] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <button type="button" className={`${SECONDARY} self-start`} onClick={onClose}>
            {LESSON.backToCanvas}
          </button>
          <h2 id={headingId} ref={heading} tabIndex={-1} className="text-2xl font-semibold text-ink-bright">
            {concept.title}
          </h2>
          <p className="text-sm">{concept.oneLiner}</p>
        </div>

        <div className="flex flex-col gap-4">
          {concept.lesson.core.map((block, index) => (
            <LessonBlock key={index} block={block} catalog={catalog} />
          ))}
        </div>

        {concept.lesson.keyNumbers.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink-bright">{LESSON.keyNumbers}</h3>
            <dl className="flex flex-col gap-2 text-sm">
              {concept.lesson.keyNumbers.map((fact) => (
                <div key={fact.tag + fact.label} className="border-l-2 border-panel-line pl-3">
                  <dt className="text-ink-bright">
                    {fact.label}: <span className="num">{fact.value}</span>
                  </dt>
                  <dd className="text-xs leading-relaxed">{fact.note}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {concept.lesson.misconceptions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink-bright">{LESSON.misconceptions}</h3>
            <dl className="flex flex-col gap-3 text-sm">
              {concept.lesson.misconceptions.map((item) => (
                <div key={item.tag + item.claim} className="border-l-2 border-pressure pl-3">
                  <dt className="text-ink-bright">“{item.claim}”</dt>
                  <dd className="mt-1 leading-relaxed">{item.correction}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="flex flex-col gap-2 border-t border-panel-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={PRIMARY} onClick={onTakeCheck}>
              {LESSON.takeCheck}
            </button>
            {onPractice && (
              <button type="button" className={SECONDARY} onClick={onPractice}>
                {LESSON.practise}
              </button>
            )}
          </div>
          <p className="text-xs">{LESSON.checkNote}</p>
        </div>
      </div>
    </section>
  )
}

function LessonBlock({ block, catalog }: { readonly block: Block; readonly catalog: PricedCatalog }) {
  switch (block.kind) {
    case 'prose':
      return <p className="text-base leading-relaxed">{block.text}</p>
    case 'formula':
      return (
        <figure className="flex flex-col gap-2 rounded border border-panel-line bg-panel-raised px-4 py-3">
          <p className="num text-base text-ink-bright">{block.formula}</p>
          <figcaption className="text-sm leading-relaxed">{block.explanation}</figcaption>
        </figure>
      )
    case 'callout':
      return (
        <aside
          className={`border-l-2 pl-3 text-base leading-relaxed ${block.tone === 'warning' ? 'border-fault text-ink-bright' : 'border-flow'}`}
        >
          {block.text}
        </aside>
      )
    case 'diagram':
      return <LessonDiagram architecture={block.architecture} caption={block.caption} />
    case 'demo':
      return <DemoWidget demoId={block.demoId} catalog={catalog} />
  }
}
