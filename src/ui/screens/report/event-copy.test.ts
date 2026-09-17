import { describe, expect, it } from 'vitest'
import { BALANCE } from '../../../config/balance'
import type { SimEvent } from '../../../engine'
import { describeEvent } from './event-copy'

// What the weekly report says about an outage (02-SIMULATION §5.7, M6a acceptance).

const nameOf = (nodeId: string) => (nodeId === 'app' ? 'App server' : 'Database')
const describe_ = (event: SimEvent) => describeEvent(event, nameOf)

const failed = (over: Partial<Extract<SimEvent, { kind: 'node-failed' }>> = {}): SimEvent => ({
  kind: 'node-failed',
  nodeId: 'app',
  failedInstances: 1,
  replicas: 1,
  turns: 1,
  ...over,
})

describe('an outage in the weekly report', () => {
  it('names the node and says nothing was left to take the traffic', () => {
    const text = describe_(failed())
    expect(text).toContain('App server went down and stayed down this week.')
    expect(text).toContain('every request that had to cross it failed')
    expect(text).toContain('one of everything is zero of something')
  })

  it('counts the weeks when an outage runs longer than one', () => {
    expect(describe_(failed({ turns: 3 }))).toContain('this week and the 2 after it')
  })

  it('says a node with peers kept serving, and at what share of capacity', () => {
    const text = describe_(failed({ replicas: 4, turns: BALANCE.failure.recoveryTurns }))
    expect(text).toContain('lost 1 of its 4 instances')
    expect(text).toContain('The remaining 3 kept serving, at 75% of the capacity you are paying for.')
    expect(text).not.toContain('every request')
  })

  it('says when the node came back', () => {
    expect(describe_({ kind: 'node-recovered', nodeId: 'db' })).toBe('Database was replaced and ran normally again this week.')
  })

  it('keeps the interface voice: no exclamation points and no apology (05-UI-DESIGN §8)', () => {
    const events: SimEvent[] = [failed(), failed({ replicas: 3 }), { kind: 'node-recovered', nodeId: 'app' }]
    for (const event of events) {
      const text = describe_(event)
      expect(text).not.toMatch(/!/)
      expect(text).not.toMatch(/sorry|unfortunately|oops/i)
    }
  })
})
