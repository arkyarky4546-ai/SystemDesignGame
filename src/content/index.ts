// The content layer's public surface. M5 adds the Zod schemas and validates all of it at
// import time; until then the types in `schema.ts` are what holds it together.
export { COMPONENT_DEFS } from './components'
export { CONCEPTS } from './concepts'
export { loadQuestions } from './questions'
export * from './schema'
