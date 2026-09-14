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

  it('size every resource with positive figures in whole cents, growing with size (ADR-0033)', () => {
    expect(COMPONENT_DEFS.ingress.tiers).toEqual([])
    for (const kind of COMPONENT_KINDS.filter((each) => each !== 'ingress')) {
      const { tiers } = COMPONENT_DEFS[kind]
      expect(tiers.length, kind).toBeGreaterThan(0)
      tiers.forEach((tier, index) => {
        const name = `${kind} ${tier.label}`
        expect(tier.capacityRps, name).toBeGreaterThan(0)
        expect(tier.serviceTimeMs, name).toBeGreaterThan(0)
        expect(Number.isSafeInteger(tier.setupCostCents) && tier.setupCostCents >= 0, name).toBe(true)
        expect(Number.isSafeInteger(tier.runningCostPerTurnCents) && tier.runningCostPerTurnCents >= 0, name).toBe(true)
        const smaller = tiers[index - 1]
        if (smaller) expect(tier.capacityRps, name).toBeGreaterThan(smaller.capacityRps)
      })
    }
  })
})
