import { useId, useMemo, useRef, useState } from 'react'
import { CONCEPTS } from '../../../content/concepts'
import { CONCEPT_IDS, type Block, type Concept, type ConceptId } from '../../../content/schema'
import { hasPassed, type Knowledge } from '../../../engine'
import { tiersUnlockedBy } from '../../../state/unlocks'
import { LIBRARY } from './library-copy'

type LibraryScreenProps = {
  readonly knowledge: Knowledge
  readonly onOpenLesson: (conceptId: ConceptId) => void
  readonly onPractice: (conceptId: ConceptId) => void
  readonly onClose: () => void
}

const SECONDARY = 'rounded border border-panel-line px-3 py-2 text-sm text-ink-bright hover:border-flow'
const LINK = 'underline decoration-flow decoration-dotted underline-offset-4 hover:text-ink-bright'
const FIELD = 'w-full rounded border border-panel-line bg-panel-void px-2 py-1 text-sm text-ink-bright'

/**
 * The reference library (00-GAME-DESIGN §7). Everything is readable, on every difficulty,
 * whether or not its check has been passed — looking something up is the job, not cheating.
 * Organized by tier and searchable, because it is also meant to work as a study resource.
 *
 * A concept that hasn't been passed says so and says what it would unlock, so the library
 * doubles as the answer to "what is this for".
 */
export function LibraryScreen({ knowledge, onOpenLesson, onPractice, onClose }: LibraryScreenProps) {
  const headingId = useId()
  const searchId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => CONCEPT_IDS.filter((id) => matchesQuery(CONCEPTS[id], query)), [query])
  const tiers = useMemo(() => [...new Set(matches.map((id) => CONCEPTS[id].tier))].sort((a, b) => a - b), [matches])

  return (
    <section aria-labelledby={headingId} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-[68ch] flex-col gap-5">
        <div className="flex flex-col gap-2">
          <button type="button" className={`${SECONDARY} self-start`} onClick={onClose}>
            {LIBRARY.backToCanvas}
          </button>
          <h2 id={headingId} ref={heading} tabIndex={-1} className="text-2xl font-semibold text-ink-bright">
            {LIBRARY.title}
          </h2>
          <p className="text-sm">{LIBRARY.lead}</p>
        </div>

        <label htmlFor={searchId} className="flex flex-col gap-1 text-xs">
          {LIBRARY.search}
          <input id={searchId} type="search" className={FIELD} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        {matches.length === 0 && <p className="text-sm">{LIBRARY.noMatches}</p>}

        {tiers.map((tier) => (
          <section key={tier} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-ink-bright">{LIBRARY.tier(tier)}</h3>
            <ul className="flex flex-col gap-3">
              {matches
                .filter((id) => CONCEPTS[id].tier === tier)
                .map((id) => (
                  <ConceptCard
                    key={id}
                    concept={CONCEPTS[id]}
                    passed={hasPassed(knowledge, id)}
                    onOpenLesson={() => onOpenLesson(id)}
                    onPractice={() => onPractice(id)}
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}

function ConceptCard({
  concept,
  passed,
  onOpenLesson,
  onPractice,
}: {
  readonly concept: Concept
  readonly passed: boolean
  readonly onOpenLesson: () => void
  readonly onPractice: () => void
}) {
  const unlocks = tiersUnlockedBy(concept.id).map((tier) => `${tier.label} ${tier.displayName.toLowerCase()}`)
  return (
    <li className="flex flex-col gap-1 border-l-2 border-panel-line pl-3">
      <p className="text-sm font-medium text-ink-bright">
        <button type="button" className={LINK} onClick={onOpenLesson}>
          {concept.title}
        </button>{' '}
        <span className="text-xs font-normal">{passed ? LIBRARY.passed : LIBRARY.notPassed}</span>
      </p>
      <p className="text-sm">{concept.oneLiner}</p>
      {unlocks.length > 0 && <p className="text-xs">{LIBRARY.unlocks(unlocks, passed)}</p>}
      <p className="text-xs">
        <button type="button" className={LINK} onClick={onPractice}>
          {LIBRARY.practise}
        </button>
      </p>
    </li>
  )
}

/** Matches a concept's title, one-liner and lesson prose, so searching finds what it says. */
function matchesQuery(concept: Concept, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [
    concept.title,
    concept.oneLiner,
    ...concept.lesson.core.map(searchableText),
    ...concept.lesson.keyNumbers.map((fact) => `${fact.label} ${fact.value} ${fact.note}`),
    ...concept.lesson.misconceptions.map((item) => `${item.claim} ${item.correction}`),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/** What a block contributes to a search: its words, whatever kind it is. */
function searchableText(block: Block): string {
  switch (block.kind) {
    case 'prose':
    case 'callout':
      return block.text
    case 'formula':
      return `${block.formula} ${block.explanation}`
    case 'diagram':
      return block.caption
    case 'demo':
      return block.demoId
  }
}
