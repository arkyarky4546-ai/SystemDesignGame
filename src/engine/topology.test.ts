import { describe, expect, it } from 'vitest'
import { appNode, databaseNode, edge, ingressNode, unwrap } from './test-helpers'
import { resolveLinearPath } from './topology'
import { REQUEST_CLASSES } from './types'

describe('resolveLinearPath', () => {
  it('returns the chain in traversal order whatever order it was declared in', () => {
    const path = unwrap(
      resolveLinearPath({
        nodes: [databaseNode('db'), ingressNode(), appNode('app')],
        edges: [edge('app', 'db'), edge('ingress', 'app')],
      }),
    )
    expect(path.map((node) => node.id)).toEqual(['ingress', 'app', 'db'])
  })

  describe('cycles', () => {
    it('rejects a cycle with a typed error naming its nodes', () => {
      const result = resolveLinearPath({
        nodes: [ingressNode(), appNode('a'), appNode('b'), databaseNode('db')],
        edges: [edge('ingress', 'a'), edge('a', 'b'), edge('b', 'a'), edge('b', 'db')],
      })
      expect(result).toEqual({ ok: false, error: { kind: 'cycle', nodeIds: ['a', 'b'] } })
    })

    it('rejects a self-loop', () => {
      const result = resolveLinearPath({
        nodes: [ingressNode(), appNode('a'), databaseNode('db')],
        edges: [edge('ingress', 'a'), edge('a', 'a'), edge('a', 'db')],
      })
      expect(result).toEqual({ ok: false, error: { kind: 'cycle', nodeIds: ['a'] } })
    })

    it('finds a cycle that ingress cannot reach', () => {
      const result = resolveLinearPath({
        nodes: [ingressNode(), appNode('a'), databaseNode('db'), appNode('x'), appNode('y')],
        edges: [edge('ingress', 'a'), edge('a', 'db'), edge('x', 'y'), edge('y', 'x')],
      })
      expect(result).toEqual({ ok: false, error: { kind: 'cycle', nodeIds: ['x', 'y'] } })
    })
  })

  it('requires an ingress', () => {
    const result = resolveLinearPath({ nodes: [appNode('a'), databaseNode('db')], edges: [edge('a', 'db')] })
    expect(result).toEqual({ ok: false, error: { kind: 'missing-ingress' } })
  })

  it('allows only one ingress', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode('i1'), ingressNode('i2'), appNode('a'), databaseNode('db')],
      edges: [edge('i1', 'a'), edge('i2', 'a'), edge('a', 'db')],
    })
    expect(result).toEqual({ ok: false, error: { kind: 'multiple-ingress', nodeIds: ['i1', 'i2'] } })
  })

  it('rejects edges into ingress', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), appNode('a'), databaseNode('db')],
      edges: [edge('a', 'ingress'), edge('ingress', 'db')],
    })
    expect(result).toEqual({ ok: false, error: { kind: 'ingress-has-inbound', nodeId: 'ingress' } })
  })

  it('rejects edges to unknown nodes', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), databaseNode('db')],
      edges: [edge('ingress', 'ghost')],
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unknown-edge-endpoint', edge: edge('ingress', 'ghost'), nodeId: 'ghost' },
    })
  })

  it('rejects duplicate node ids', () => {
    const result = resolveLinearPath({ nodes: [ingressNode(), appNode('a'), appNode('a')], edges: [] })
    expect(result).toEqual({ ok: false, error: { kind: 'duplicate-node-id', nodeId: 'a' } })
  })

  it('rejects duplicate edges', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), appNode('a'), databaseNode('db')],
      edges: [edge('ingress', 'a'), edge('ingress', 'a'), edge('a', 'db')],
    })
    expect(result).toEqual({ ok: false, error: { kind: 'duplicate-edge', edge: edge('ingress', 'a') } })
  })

  it('keeps databases terminal', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), databaseNode('db'), appNode('a')],
      edges: [edge('ingress', 'db'), edge('db', 'a')],
    })
    expect(result).toEqual({ ok: false, error: { kind: 'datastore-not-terminal', nodeId: 'db' } })
  })

  it('rejects fan-out until load splitting is modeled', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), appNode('a'), databaseNode('d1'), databaseNode('d2')],
      edges: [edge('ingress', 'a'), edge('a', 'd1'), edge('a', 'd2')],
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported-topology', nodeId: 'a', reason: 'branching' },
    })
  })

  it('rejects fan-in until load splitting is modeled', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), appNode('a1'), appNode('a2'), databaseNode('db')],
      edges: [edge('ingress', 'a1'), edge('a1', 'db'), edge('a2', 'db')],
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported-topology', nodeId: 'db', reason: 'branching' },
    })
  })

  it('rejects nodes that are not on the request path', () => {
    const result = resolveLinearPath({
      nodes: [ingressNode(), appNode('a'), databaseNode('db'), appNode('lonely')],
      edges: [edge('ingress', 'a'), edge('a', 'db')],
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported-topology', nodeId: 'lonely', reason: 'disconnected' },
    })
  })

  it('requires the path to end at a datastore', () => {
    const result = resolveLinearPath({ nodes: [ingressNode(), appNode('a')], edges: [edge('ingress', 'a')] })
    expect(result).toEqual({ ok: false, error: { kind: 'no-datastore-path', requestClasses: REQUEST_CLASSES } })
  })
})
