import type { ConceptId, Question } from '../schema'
import { capacityAndUtilizationAuthored } from './capacity-and-utilization/authored'
import { percentilesAuthored } from './percentiles/authored'
import { verticalScalingAuthored } from './vertical-scaling/authored'

/**
 * Every authored pool in one place, for the generator, the screener and their tests. The
 * game loads pools one concept at a time through `loadQuestions`, which is what keeps a
 * concept's bank out of the initial bundle (09-QUESTION-BANK §4.2); this registry is the
 * build-time view of the same content and never reaches the browser.
 *
 * Two of the concepts M7 added have no authored questions yet: M7b writes them, a batch of
 * 10–15 per session (09-QUESTION-BANK §8).
 */
export const AUTHORED: Readonly<Record<ConceptId, readonly Question[]>> = {
  'client-server-basics': [],
  'latency-and-throughput': [],
  'capacity-and-utilization': capacityAndUtilizationAuthored,
  percentiles: percentilesAuthored,
  'vertical-scaling': verticalScalingAuthored,
}
