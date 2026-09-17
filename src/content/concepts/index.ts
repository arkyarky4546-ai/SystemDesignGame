import type { Concept, ConceptId } from '../schema'
import { capacityAndUtilization } from './tier-1/capacity-and-utilization'
import { percentiles } from './tier-1/percentiles'

/** Every concept, by id. Adding an id to CONCEPT_IDS fails typecheck until it has one. */
export const CONCEPTS: { readonly [K in ConceptId]: Concept & { readonly id: K } } = {
  'capacity-and-utilization': capacityAndUtilization,
  percentiles,
}
