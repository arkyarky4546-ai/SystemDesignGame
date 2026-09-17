import type { ConceptId, QuestionTemplate } from '../schema'
import { capacityAndUtilizationTemplates } from './capacity-and-utilization/templates'
import { clientServerBasicsTemplates } from './client-server-basics/templates'
import { latencyAndThroughputTemplates } from './latency-and-throughput/templates'
import { percentilesTemplates } from './percentiles/templates'
import { verticalScalingTemplates } from './vertical-scaling/templates'

/**
 * Every derived-question template, by concept (09-QUESTION-BANK §2.1). Imported by the
 * generator, the screener and their tests — never by the game, which reads the frozen
 * `derived.json` a template produced rather than running the template.
 */
export const TEMPLATES: Readonly<Record<ConceptId, readonly QuestionTemplate[]>> = {
  'client-server-basics': clientServerBasicsTemplates,
  'latency-and-throughput': latencyAndThroughputTemplates,
  'capacity-and-utilization': capacityAndUtilizationTemplates,
  percentiles: percentilesTemplates,
  'vertical-scaling': verticalScalingTemplates,
}
