// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CONCEPTS } from '../content/concepts'
import { CONCEPT_IDS } from '../content/schema'
import { CONTENT_CATALOG } from '../state/catalog'
import { LESSON } from './screens/learning/learning-copy'
import { LessonScreen } from './screens/learning/LessonScreen'

afterEach(cleanup)

/** The concepts whose check opens component sizes: app servers, then databases (ADR-0040). */
const OPENS_SOMETHING: readonly string[] = ['capacity-and-utilization', 'vertical-scaling']

// Every concept validates and renders. Validation is `content/validate.test.ts`; this is the
// other half — every block kind a lesson uses has a renderer, and nothing a lesson carries is
// silently dropped on the way to the screen.

describe.each(CONCEPT_IDS)('the %s lesson renders', (conceptId) => {
  const concept = CONCEPTS[conceptId]

  it('shows its title, one-liner and every core block', () => {
    render(<LessonScreen conceptId={conceptId} catalog={CONTENT_CATALOG} onTakeCheck={() => {}} onClose={() => {}} />)

    expect(screen.getByRole('heading', { name: concept.title })).toBeTruthy()
    expect(screen.getByText(concept.oneLiner)).toBeTruthy()

    for (const block of concept.lesson.core) {
      switch (block.kind) {
        case 'prose':
        case 'callout':
          expect(screen.getByText(block.text)).toBeTruthy()
          break
        case 'formula':
          expect(screen.getByText(block.formula)).toBeTruthy()
          expect(screen.getByText(block.explanation)).toBeTruthy()
          break
      }
    }
  })

  it('shows every key number and every misconception', () => {
    render(<LessonScreen conceptId={conceptId} catalog={CONTENT_CATALOG} onTakeCheck={() => {}} onClose={() => {}} />)

    for (const fact of concept.lesson.keyNumbers) {
      expect(screen.getByText(fact.value)).toBeTruthy()
      expect(screen.getByText(fact.note)).toBeTruthy()
    }
    for (const item of concept.lesson.misconceptions) {
      expect(screen.getByText(`“${item.claim}”`)).toBeTruthy()
      expect(screen.getByText(item.correction)).toBeTruthy()
    }
  })

  it('offers the check as its only primary action', () => {
    render(<LessonScreen conceptId={conceptId} catalog={CONTENT_CATALOG} onTakeCheck={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Take the check' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to canvas' })).toBeTruthy()
  })

  it('promises an unlock under the check only when passing it opens something', () => {
    render(<LessonScreen conceptId={conceptId} catalog={CONTENT_CATALOG} onTakeCheck={() => {}} onClose={() => {}} />)
    expect(screen.getByText(LESSON.checkNote(concept.check.drawCount, OPENS_SOMETHING.includes(conceptId)))).toBeTruthy()
  })
})

describe.each(CONCEPT_IDS.filter((id) => CONCEPTS[id].lesson.deeper))('the %s lesson’s go-deeper section', (conceptId) => {
  it('is collapsed, says what is inside, and holds every block', () => {
    const deeper = CONCEPTS[conceptId].lesson.deeper
    if (!deeper) throw new Error('expected a deeper section')
    const { container } = render(
      <LessonScreen conceptId={conceptId} catalog={CONTENT_CATALOG} onTakeCheck={() => {}} onClose={() => {}} />,
    )

    const details = container.querySelector('details')
    const summary = details?.querySelector('summary')
    if (!details || !summary) throw new Error('expected a collapsed section with a summary')
    expect(details.open).toBe(false)
    expect(within(summary).getByText(deeper.summary, { exact: false })).toBeTruthy()
    for (const block of deeper.blocks) {
      if (block.kind === 'prose' || block.kind === 'callout') expect(within(details).getByText(block.text)).toBeTruthy()
      if (block.kind === 'formula') expect(within(details).getByText(block.formula)).toBeTruthy()
    }
  })
})

describe('the go-deeper sections', () => {
  it('exist on the three lessons M7 wrote, where the prose ran past what everyone needs', () => {
    expect(CONCEPT_IDS.filter((id) => CONCEPTS[id].lesson.deeper)).toEqual([
      'client-server-basics',
      'latency-and-throughput',
      'vertical-scaling',
    ])
  })
})
