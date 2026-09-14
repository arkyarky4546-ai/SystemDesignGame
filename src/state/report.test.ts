import { describe, expect, it } from 'vitest'
import { simulateTick, type TickInput } from '../engine'
import { BASE_WORKLOAD, appNode, databaseNode, edge, ingressNode, unwrap } from '../engine/test-helpers'
import { findLoadFinding } from './report'

const tier = (capacityRps: number) => ({ capacityRps, serviceTimeMs: 10 })

// ingress → each app in order → database, at `peakRps` with fanout 1. Capacities are per
// node, so utilizations come out exactly as the tests name them.
function tick(peakRps: number, apps: readonly (readonly [string, number])[], database: readonly [string, number]) {
  const ids = [...apps.map(([id]) => id), database[0]]
  const input: TickInput = {
    turn: 1,
    workload: { ...BASE_WORKLOAD, meanRps: peakRps },
    // Every node uses its own tier index, so each can have its own capacity.
    catalog: { 'app-server': apps.map(([, capacity]) => tier(capacity)), database: [tier(database[1])] },
    architecture: {
      nodes: [ingressNode(), ...apps.map(([id], index) => ({ ...appNode(id), tier: index })), databaseNode(database[0])],
      edges: ['ingress', ...ids].slice(0, -1).map((from, index) => edge(from, ids[index] ?? '')),
    },
  }
  return unwrap(simulateTick(input))
}

describe('findLoadFinding (05-UI-DESIGN §5, 07-TESTING §5)', () => {
  it('names the saturated database as the bottleneck and the app tier as not the problem', () => {
    // app at 61/100, database at 61/64.
    const result = tick(61, [['app', 100]], ['db', 64])
    expect(result.perNode.app?.status).toBe('healthy')
    expect(result.perNode.db?.status).toBe('saturated')
    expect(findLoadFinding(result)).toEqual({
      kind: 'bottleneck',
      bottleneck: 'db',
      alsoDropping: [],
      notTheProblem: { nodeId: 'app', maskedBy: null },
    })
  })

  it('names the busiest healthy node, the one most likely to be fixed by mistake', () => {
    // web at 20%, api at 61%, database saturated.
    const result = tick(
      61,
      [
        ['web', 305],
        ['api', 100],
      ],
      ['db', 64],
    )
    expect(findLoadFinding(result)).toMatchObject({ bottleneck: 'db', notTheProblem: { nodeId: 'api' } })
  })

  it('warns when the healthy node only looked healthy because an earlier node dropped requests', () => {
    // app gets 200 against 100 and passes 100 on; the database sees 100 against 400.
    const finding = findLoadFinding(tick(200, [['app', 100]], ['db', 400]))
    expect(finding).toEqual({
      kind: 'bottleneck',
      bottleneck: 'app',
      alsoDropping: [],
      notTheProblem: { nodeId: 'db', maskedBy: 'app' },
    })
  })

  it('names nothing as fine when every node is under pressure, and lists the other droppers', () => {
    // app gets 200 against 100; the database gets 100 against 80.
    expect(findLoadFinding(tick(200, [['app', 100]], ['db', 80]))).toEqual({
      kind: 'bottleneck',
      bottleneck: 'app',
      alsoDropping: ['db'],
      notTheProblem: null,
    })
  })

  it('names the busiest node and the one with the most headroom when nothing is under pressure', () => {
    // app at 60%, database at 15%.
    expect(findLoadFinding(tick(60, [['app', 100]], ['db', 400]))).toEqual({
      kind: 'all-healthy',
      busiest: 'app',
      mostHeadroom: 'db',
    })
  })

  it('follows path order rather than object key order for numeric-looking ids', () => {
    // Keys "10" and "2" sort numerically in an object; the path runs 10 → 2 → db. Both apps tie at 50%.
    const finding = findLoadFinding(
      tick(
        50,
        [
          ['10', 100],
          ['2', 100],
        ],
        ['db', 400],
      ),
    )
    expect(finding).toMatchObject({ kind: 'all-healthy', busiest: '10' })
  })
})
