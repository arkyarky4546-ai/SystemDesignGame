import { describe, expect, it } from 'vitest'
import { createRng, nextFloat, rngForTurn, type Rng } from './rng'

function draws(rng: Rng, count: number): number[] {
  const values: number[] = []
  let current = rng
  for (let i = 0; i < count; i++) {
    const next = nextFloat(current)
    values.push(next.value)
    current = next.rng
  }
  return values
}

describe('rng', () => {
  it('replays the same sequence for the same seed', () => {
    expect(draws(createRng(42), 100)).toEqual(draws(createRng(42), 100))
  })

  it('never modifies the generator it draws from', () => {
    const rng = Object.freeze(createRng(7))
    const first = nextFloat(rng)
    expect(nextFloat(rng)).toEqual(first)
    expect(first.rng).not.toEqual(rng)
  })

  it('draws floats in [0, 1) with a mean near 0.5', () => {
    const values = draws(createRng(2026), 10_000)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean).toBeGreaterThan(0.49)
    expect(mean).toBeLessThan(0.51)
  })

  it('gives different seeds different sequences', () => {
    const firstDraws = new Set(Array.from({ length: 100 }, (_, seed) => nextFloat(createRng(seed)).value))
    expect(firstDraws.size).toBe(100)
  })

  it('treats seeds as unsigned 32-bit integers', () => {
    expect(createRng(-1)).toEqual(createRng(2 ** 32 - 1))
  })
})

describe('rngForTurn', () => {
  it('replays a turn identically', () => {
    expect(draws(rngForTurn(99, 5), 20)).toEqual(draws(rngForTurn(99, 5), 20))
  })

  it('gives each turn and each seed its own stream', () => {
    expect(draws(rngForTurn(99, 5), 5)).not.toEqual(draws(rngForTurn(99, 6), 5))
    expect(draws(rngForTurn(99, 5), 5)).not.toEqual(draws(rngForTurn(100, 5), 5))
  })

  it('does not let extra draws in one turn shift the next turn', () => {
    const turnSix = draws(rngForTurn(99, 6), 10)
    draws(rngForTurn(99, 5), 1_000)
    expect(draws(rngForTurn(99, 6), 10)).toEqual(turnSix)
  })
})
