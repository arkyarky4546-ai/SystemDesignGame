// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CONCEPTS } from '../content/concepts'
import { CONCEPT_IDS } from '../content/schema'
import { CONTENT_CATALOG } from '../state/catalog'
import { LessonScreen } from './screens/learning/LessonScreen'

afterEach(cleanup)

// M5's "both sample concepts validate and render". Validation is `content/validate.test.ts`;
// this is the other half — every block kind a lesson uses has a renderer, and nothing a
// lesson carries is silently dropped on the way to the screen.
//
// `percentiles` has no in-game route yet: it gates nothing, so no inspector names it. The
// library that reaches every concept is M6's.

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
})
