import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from './components'
import { CONCEPTS } from './concepts'
import { DEMOS } from './demos'
import { DEMO_IDS } from './schema'

// 07-TESTING: every demo's variable exists on its architecture. A demo that names a node its
// architecture doesn't have renders dashes instead of figures, and nothing else would notice.

describe.each(DEMO_IDS)('the %s demo', (demoId) => {
  const demo = DEMOS[demoId]
  const node = (id: string) => demo.architecture.nodes.find((each) => each.id === id)

  it('shows the figures of a component its architecture has', () => {
    expect(node(demo.nodeId)?.kind).not.toBe('ingress')
    expect(node(demo.nodeId)).toBeDefined()
  })

  it('moves something its architecture has, within a sensible range', () => {
    const variable = demo.variable
    expect(variable.min).toBeLessThan(variable.max)
    expect(variable.step).toBeGreaterThan(0)
    if (variable.kind === 'capacityRps') {
      expect(node(variable.nodeId)).toBeDefined()
      expect(node(variable.nodeId)?.kind).not.toBe('ingress')
      expect(variable.min).toBeGreaterThan(0)
    }
  })

  it('names only sizes that exist', () => {
    for (const each of demo.architecture.nodes) {
      if (each.kind === 'ingress') continue
      expect(COMPONENT_DEFS[each.kind].tiers[each.tier], `${each.id} at size ${each.tier}`).toBeDefined()
    }
  })

  it('is used by a lesson', () => {
    const blocks = Object.values(CONCEPTS).flatMap((concept) => [...concept.lesson.core, ...(concept.lesson.deeper?.blocks ?? [])])
    expect(blocks.some((block) => block.kind === 'demo' && block.demoId === demoId)).toBe(true)
  })
})
