import type { ConceptId, Question } from '../schema'

/**
 * One loader per concept, so a check downloads that concept's questions and nothing else
 * (09-QUESTION-BANK §4.2). The initial bundle contains no questions at all, which is what
 * M10 has to ship. M5a adds each concept's `derived.json` alongside its authored pool.
 */
const LOADERS: Readonly<Record<ConceptId, () => Promise<readonly Question[]>>> = {
  'capacity-and-utilization': async () =>
    (await import('./capacity-and-utilization/authored')).capacityAndUtilizationAuthored,
}

export function loadQuestions(conceptId: ConceptId): Promise<readonly Question[]> {
  return LOADERS[conceptId]()
}
