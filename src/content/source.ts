import { COMPONENT_DEFS } from './components'
import { CONCEPTS } from './concepts'
import { loadQuestions } from './questions'
import { CONCEPT_IDS } from './schema'
import type { ContentSource } from './validate'

/**
 * Every content file, loaded together, for `npm run validate` and for tests. The game never
 * calls this: it would pull every concept's question chunk, which is exactly what
 * 09-QUESTION-BANK §4.2 splits them to avoid.
 */
export async function loadContentSource(): Promise<ContentSource> {
  const pools = await Promise.all(CONCEPT_IDS.map(async (id) => [id, await loadQuestions(id)] as const))
  return {
    concepts: Object.values(CONCEPTS),
    components: Object.values(COMPONENT_DEFS),
    questions: Object.fromEntries(pools),
  }
}
