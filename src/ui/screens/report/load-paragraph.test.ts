import { describe, expect, it } from 'vitest'
import { serviceLevel, simulateTick } from '../../../engine'
import { linearInput, unwrap } from '../../../engine/test-helpers'
import { formatMs } from '../../format'
import { describeLoad } from './load-paragraph'

const tier = (capacityRps: number) => ({ capacityRps, serviceTimeMs: 10 })

// ingress → App server → Database, at `peakRps` with fanout 1.
function paragraph(peakRps: number, appRps: number, databaseRps: number) {
  const input = linearInput({ peakRps, app: tier(appRps), database: tier(databaseRps) })
  const tick = unwrap(simulateTick(input))
  return { text: describeLoad(tick, input.architecture), tick }
}

describe('the weekly report’s bottleneck paragraph (M4 acceptance, 07-TESTING §5)', () => {
  it('names the saturated database as the bottleneck and the app tier as not the problem', () => {
    // App server at 70/100. Database gets 70 against 64 and turns away 6.
    const { text, tick } = paragraph(70, 100, 64)
    expect(tick.bottleneck).toBe('db')
    expect(text).toContain('Database was the bottleneck: it received 70/s at peak against a capacity of 64/s, and turned away 6/s.')
    expect(text).toContain('Every failed request this week was one it turned away.')
    expect(text).toContain('App server wasn’t the problem: it ran at 70%.')
  })

  it('gives the bottleneck’s exact share of p99', () => {
    const { text, tick } = paragraph(70, 100, 64)
    const database = tick.perNode.db
    expect(text).toContain(`It accounted for ${formatMs(database?.p99Ms ?? 0)} of the ${formatMs(serviceLevel(tick).p99Ms)} p99.`)
  })

  it('says a healthy-looking node only saw what the bottleneck let through', () => {
    // App server gets 200 against 100 and passes 100 on. Database sees 100 of 400.
    const { text } = paragraph(200, 100, 400)
    expect(text).toContain('App server was the bottleneck: it received 200/s at peak against a capacity of 100/s, and turned away 100/s.')
    expect(text).toContain('Database ran at 25%, but it only saw the requests App server didn’t turn away.')
    expect(text).not.toContain('wasn’t the problem')
  })

  it('calls nothing fine when every node is under pressure', () => {
    // App server gets 200 against 100. Database gets 100 against 80.
    const { text } = paragraph(200, 100, 80)
    expect(text).toContain('Database turned requests away too.')
    expect(text).toContain('No component had headroom: every one ran at 75% or more.')
  })

  it('names a bottleneck that is under pressure without saturating', () => {
    // App server at 80/100, Database at 80/400.
    const { text } = paragraph(80, 100, 400)
    expect(text).toContain('App server was the busiest component, at 80% of its capacity at peak, above the 75% warning line.')
    expect(text).toContain('Database wasn’t the problem: it ran at 20%.')
  })

  it('names the busiest node and the one with most headroom when nothing is under pressure', () => {
    const { text } = paragraph(60, 100, 400)
    expect(text).toBe(
      'Every component ran below 75% of its capacity at peak. App server was the busiest, at 60%, and Database had the most headroom, at 15%.',
    )
  })

  it('keeps the interface voice: no exclamation points (05-UI-DESIGN §8)', () => {
    for (const [peak, app, database] of [
      [70, 100, 64],
      [200, 100, 400],
      [200, 100, 80],
      [60, 100, 400],
    ] as const) {
      expect(paragraph(peak, app, database).text).not.toMatch(/!/)
    }
  })
})
