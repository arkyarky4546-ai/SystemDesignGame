// The content layer's public surface. Concepts and components are parsed against their Zod
// schemas in dev builds only; `npm run validate` is what guarantees them in CI and in the
// definition of done, and parsing in the browser would pay twice for one guarantee (ADR-0042).
import { COMPONENT_DEFS } from './components'
import { CONCEPTS } from './concepts'

export { COMPONENT_DEFS } from './components'
export { CONCEPTS } from './concepts'
export { DEMOS } from './demos'
export { loadQuestions } from './questions'
export * from './schema'

if (import.meta.env.DEV) {
  const { ComponentDefSchema, ConceptSchema, parseContent } = await import('./parse')
  const problems = [
    ...Object.values(CONCEPTS).flatMap((concept) => parseContent(ConceptSchema, concept, `concepts/${concept.id}`)),
    ...Object.values(COMPONENT_DEFS).flatMap((def) => parseContent(ComponentDefSchema, def, `components/${def.kind}`)),
  ]
  if (problems.length > 0) throw new Error(problems.map((problem) => `${problem.file}: ${problem.message}`).join('\n'))
}
