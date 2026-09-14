import { describe, expect, it } from 'vitest'
import { COMPONENT_KINDS } from '../schema'
import { COMPONENT_DEFS } from './index'

describe('component definitions', () => {
  it.each(COMPONENT_KINDS)('%s is keyed under its own kind', (kind) => {
    expect(COMPONENT_DEFS[kind].kind).toBe(kind)
  })

  it('agree from both ends: A may send to B exactly when B accepts from A', () => {
    for (const from of COMPONENT_KINDS) {
      for (const to of COMPONENT_KINDS) {
        const sends = COMPONENT_DEFS[from].validConnections.downstream.includes(to)
        const accepts = COMPONENT_DEFS[to].validConnections.upstream.includes(from)
        expect(sends, `${from} → ${to}`).toBe(accepts)
      }
    }
  })

  it('explain every refused pairing, and only refused ones (ADR-0027)', () => {
    for (const from of COMPONENT_KINDS) {
      const { downstream, refusedDownstream } = COMPONENT_DEFS[from].validConnections
      for (const to of COMPONENT_KINDS) {
        const reason = refusedDownstream[to]
        if (downstream.includes(to)) expect(reason, `${from} → ${to}`).toBeUndefined()
        else expect(reason?.trim().length ?? 0, `${from} → ${to}`).toBeGreaterThan(0)
      }
    }
  })

  it('write refusals in the interface voice: no exclamation points (05-UI-DESIGN §8)', () => {
    const reasons = COMPONENT_KINDS.flatMap((kind) => Object.values(COMPONENT_DEFS[kind].validConnections.refusedDownstream))
    for (const reason of reasons) expect(reason).not.toMatch(/!/)
  })
})
