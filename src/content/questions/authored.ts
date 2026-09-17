import type { ConceptId, Question } from '../schema'
import { capacityAndUtilizationAuthored } from './capacity-and-utilization/authored'
import { percentilesAuthored } from './percentiles/authored'

/**
 * Every authored pool in one place, for the generator, the screener and their tests. The
 * game loads pools one concept at a time through `loadQuestions`, which is what keeps a
 * concept's bank out of the initial bundle (09-QUESTION-BANK §4.2); this registry is the
 * build-time view of the same content and never reaches the browser.
 */
export const AUTHORED: Readonly<Record<ConceptId, readonly Question[]>> = {
  'capacity-and-utilization': capacityAndUtilizationAuthored,
  percentiles: percentilesAuthored,
}
