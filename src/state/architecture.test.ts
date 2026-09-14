import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from '../content/components'
import { createRun, type Architecture } from '../engine'
import { unwrap } from '../engine/test-helpers'
import {
  connect,
  connectionRefusal,
  disconnect,
  moveNode,
  nearestFreeCell,
  nextNodeId,
  placeNode,
  removeNode,
  setFanout,
  setTier,
} from './architecture'

// ingress (0,0) → app (0,1) → db (0,2), as a new run starts.
const starter = (): Architecture => createRun({ seed: 1, difficulty: 'junior' }).architecture

describe('placing and moving', () => {
  it('places a component at its base tier with a fresh id', () => {
    const { architecture, nodeId } = unwrap(placeNode(starter(), 'app-server', { col: 1, row: 1 }))
    expect(nodeId).toBe('app-server-1')
    expect(architecture.nodes.at(-1)).toEqual({
      id: 'app-server-1',
      kind: 'app-server',
      replicas: 1,
      tier: 0,
      config: { fanoutFactor: 1 },
      position: { col: 1, row: 1 },
    })
    expect(nextNodeId(architecture, 'app-server')).toBe('app-server-2')
  })

  it('refuses an occupied cell and a kind the player cannot place', () => {
    expect(placeNode(starter(), 'database', { col: 0, row: 2 })).toEqual({
      ok: false,
      error: { kind: 'cell-taken', nodeId: 'db' },
    })
    expect(placeNode(starter(), 'ingress', { col: 3, row: 3 })).toEqual({
      ok: false,
      error: { kind: 'not-placeable', componentKind: 'ingress' },
    })
  })

  it('moves a node to a free cell, allows dropping it where it was, and refuses another node’s cell', () => {
    const moved = unwrap(moveNode(starter(), 'db', { col: 2, row: 4 }))
    expect(moved.nodes.find((node) => node.id === 'db')?.position).toEqual({ col: 2, row: 4 })
    expect(unwrap(moveNode(starter(), 'db', { col: 0, row: 2 }))).toEqual(starter())
    expect(moveNode(starter(), 'db', { col: 0, row: 1 })).toEqual({ ok: false, error: { kind: 'cell-taken', nodeId: 'app' } })
    expect(moveNode(starter(), 'ghost', { col: 5, row: 5 })).toEqual({
      ok: false,
      error: { kind: 'unknown-node', nodeId: 'ghost' },
    })
  })

  it('finds the nearest free cell ring by ring, never off the grid', () => {
    expect(nearestFreeCell(starter(), { col: 3, row: 3 })).toEqual({ col: 3, row: 3 })
    expect(nearestFreeCell(starter(), { col: 0, row: 1 })).toEqual({ col: 1, row: 0 })
    const full = unwrap(placeNode(starter(), 'database', { col: 1, row: 0 })).architecture
    expect(nearestFreeCell(full, { col: 0, row: 1 })).toEqual({ col: 1, row: 1 })
  })
})

describe('removing', () => {
  it('removes a node with every connection touching it', () => {
    const removed = unwrap(removeNode(starter(), 'app'))
    expect(removed.nodes.map((node) => node.id)).toEqual(['ingress', 'db'])
    expect(removed.edges).toEqual([])
  })

  it('refuses to remove ingress', () => {
    expect(removeNode(starter(), 'ingress')).toEqual({ ok: false, error: { kind: 'fixed-component', nodeId: 'ingress' } })
  })

  it('disconnects a single edge', () => {
    expect(disconnect(starter(), { from: 'app', to: 'db' }).edges).toEqual([{ from: 'ingress', to: 'app' }])
  })
})

describe('connecting (ComponentDef.validConnections)', () => {
  const withSecondApp = () => unwrap(placeNode(starter(), 'app-server', { col: 1, row: 1 })).architecture

  it('connects a pairing the definitions allow', () => {
    const connected = unwrap(connect(withSecondApp(), 'app-server-1', 'db'))
    expect(connected.edges.at(-1)).toEqual({ from: 'app-server-1', to: 'db' })
  })

  it('refuses a pairing with the source definition’s reason', () => {
    const refusal = connectionRefusal(starter(), 'db', 'app')
    expect(refusal).toEqual({
      kind: 'kinds',
      from: 'database',
      to: 'app-server',
      reason: COMPONENT_DEFS.database.validConnections.refusedDownstream['app-server'],
    })
    expect(connectionRefusal(starter(), 'ingress', 'db')).toMatchObject({ kind: 'kinds', reason: expect.stringContaining('app server') })
    expect(connectionRefusal(withSecondApp(), 'app-server-1', 'ingress')).toMatchObject({ kind: 'kinds' })
  })

  it('refuses self-loops, duplicates, unknown nodes and loops', () => {
    expect(connectionRefusal(starter(), 'app', 'app')).toEqual({ kind: 'self' })
    expect(connectionRefusal(starter(), 'app', 'db')).toEqual({ kind: 'duplicate' })
    expect(connectionRefusal(starter(), 'app', 'ghost')).toEqual({ kind: 'unknown-node', nodeId: 'ghost' })
    const chained = unwrap(connect(withSecondApp(), 'app', 'app-server-1'))
    expect(connectionRefusal(chained, 'app-server-1', 'app')).toEqual({ kind: 'cycle' })
    expect(connect(chained, 'app-server-1', 'app')).toEqual({
      ok: false,
      error: { kind: 'connection-refused', refusal: { kind: 'cycle' } },
    })
  })
})

describe('reconfiguring', () => {
  it('sets a tier within the definition’s tiers', () => {
    const lastTier = COMPONENT_DEFS['app-server'].tiers.length - 1
    expect(unwrap(setTier(starter(), 'app', lastTier)).nodes[1]?.tier).toBe(lastTier)
    expect(setTier(starter(), 'app', lastTier + 1)).toEqual({
      ok: false,
      error: { kind: 'invalid-tier', nodeId: 'app', tier: lastTier + 1 },
    })
    expect(setTier(starter(), 'app', 0.5).ok).toBe(false)
    expect(setTier(starter(), 'ingress', 0).ok).toBe(false)
  })

  it('sets fanout on app servers only, to a non-negative number', () => {
    const node = unwrap(setFanout(starter(), 'app', 3)).nodes[1]
    expect(node?.kind === 'app-server' && node.config.fanoutFactor).toBe(3)
    expect(setFanout(starter(), 'app', -1)).toEqual({ ok: false, error: { kind: 'invalid-fanout', nodeId: 'app' } })
    expect(setFanout(starter(), 'app', Number.NaN).ok).toBe(false)
    expect(setFanout(starter(), 'db', 2)).toEqual({ ok: false, error: { kind: 'invalid-fanout', nodeId: 'db' } })
  })
})
