import { describe, expect, it } from 'vitest'
import { layoutByFlow } from './layout'
import { edge } from './test-helpers'
import { createsCycle } from './topology'
import type { Edge, NodeId } from './types'

const positions = (ids: readonly NodeId[], edges: readonly Edge[]) => {
  const at = layoutByFlow(ids, edges)
  return Object.fromEntries(ids.map((id) => [id, at(id)]))
}

describe('layoutByFlow (ADR-0028)', () => {
  it('stacks a chain top to bottom in flow order', () => {
    expect(positions(['db', 'ingress', 'app'], [edge('ingress', 'app'), edge('app', 'db')])).toEqual({
      ingress: { col: 0, row: 0 },
      app: { col: 0, row: 1 },
      db: { col: 0, row: 2 },
    })
  })

  it('puts siblings side by side in declaration order', () => {
    const edges = [edge('ingress', 'a'), edge('ingress', 'b'), edge('a', 'db'), edge('b', 'db')]
    expect(positions(['ingress', 'b', 'a', 'db'], edges)).toEqual({
      ingress: { col: 0, row: 0 },
      b: { col: 0, row: 1 },
      a: { col: 1, row: 1 },
      db: { col: 0, row: 2 },
    })
  })

  it('places a node below the longest path that reaches it', () => {
    const edges = [edge('ingress', 'a'), edge('a', 'b'), edge('b', 'db'), edge('ingress', 'db')]
    expect(positions(['ingress', 'a', 'b', 'db'], edges).db).toEqual({ col: 0, row: 3 })
  })

  it('puts unconnected nodes in the top row and cycles below everything', () => {
    const edges = [edge('ingress', 'app'), edge('x', 'y'), edge('y', 'x'), edge('app', 'app')]
    expect(positions(['ingress', 'app', 'x', 'y', 'lonely'], edges)).toEqual({
      ingress: { col: 0, row: 0 },
      app: { col: 0, row: 1 },
      x: { col: 0, row: 2 },
      y: { col: 1, row: 2 },
      lonely: { col: 1, row: 0 },
    })
  })

  it('ignores edges to unknown nodes and never puts two nodes in one cell', () => {
    const ids = Array.from({ length: 20 }, (_, index) => `n${index}`)
    const edges = [...ids.slice(1).map((id, index) => edge(`n${Math.floor(index / 3)}`, id)), edge('n2', 'ghost')]
    const cells = Object.values(positions(ids, edges)).map(({ col, row }) => `${col},${row}`)
    expect(new Set(cells).size).toBe(ids.length)
    expect(positions(ids, edges)).toEqual(positions(ids, edges))
  })
})

describe('createsCycle', () => {
  const edges = [edge('ingress', 'a'), edge('a', 'b'), edge('b', 'db')]

  it('refuses a self-loop and any edge that leads back to its source', () => {
    expect(createsCycle(edges, 'a', 'a')).toBe(true)
    expect(createsCycle(edges, 'b', 'a')).toBe(true)
    expect(createsCycle(edges, 'db', 'ingress')).toBe(true)
  })

  it('allows edges that keep the graph acyclic, including parallel paths', () => {
    expect(createsCycle(edges, 'a', 'db')).toBe(false)
    expect(createsCycle(edges, 'ingress', 'b')).toBe(false)
    expect(createsCycle([], 'x', 'y')).toBe(false)
  })
})
