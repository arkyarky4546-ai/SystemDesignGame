import type { Concept, ConceptId } from '../schema'
import { capacityAndUtilization } from './tier-1/capacity-and-utilization'
import { clientServerBasics } from './tier-1/client-server-basics'
import { latencyAndThroughput } from './tier-1/latency-and-throughput'
import { percentiles } from './tier-1/percentiles'
import { verticalScaling } from './tier-1/vertical-scaling'

/** Every concept, by id. Adding an id to CONCEPT_IDS fails typecheck until it has one. */
export const CONCEPTS: { readonly [K in ConceptId]: Concept & { readonly id: K } } = {
  'client-server-basics': clientServerBasics,
  'latency-and-throughput': latencyAndThroughput,
  'capacity-and-utilization': capacityAndUtilization,
  percentiles,
  'vertical-scaling': verticalScaling,
}
