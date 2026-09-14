/** Seeded generator state: an unsigned 32-bit integer. Never mutated; each draw returns the next state. */
export type Rng = { readonly state: number }

/** Creates a generator from an integer seed, coerced to unsigned 32-bit. Unitless. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 }
}

/**
 * Draws a float in [0, 1) with mulberry32 (02-SIMULATION §2). Returns the value and the
 * advanced generator; the generator passed in is left unchanged (ADR-0019). Unitless.
 */
export function nextFloat(rng: Rng): { readonly value: number; readonly rng: Rng } {
  const state = (rng.state + 0x6d2b79f5) >>> 0
  let t = Math.imul(state ^ (state >>> 15), state | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, rng: { state } }
}

/**
 * The generator for one turn of a run, seeded from hash(seed, turn). Replaying a turn
 * reproduces it exactly, and an extra draw in one turn never shifts another turn's
 * outcomes (02-SIMULATION §2). Unitless.
 */
export function rngForTurn(seed: number, turn: number): Rng {
  return createRng(fmix32((seed >>> 0) ^ fmix32((turn + 0x9e3779b9) >>> 0)))
}

const SQRT_3 = 1.7320508075688772

/**
 * Draws an approximately standard normal value, unitless: mean 0, standard deviation 1,
 * bounded to ±2√3 ≈ ±3.46. Returns the value and the advanced generator (ADR-0023).
 *
 * It standardizes a sum of four uniform draws (Irwin–Hall). Box–Muller would need Math.log
 * and Math.cos, which ECMAScript leaves implementation-approximated, so a turn could
 * resolve differently in another browser. Plain arithmetic is bit-identical everywhere.
 */
export function nextNormal(rng: Rng): { readonly value: number; readonly rng: Rng } {
  let current = rng
  let sum = 0
  for (let draw = 0; draw < 4; draw++) {
    const next = nextFloat(current)
    sum += next.value
    current = next.rng
  }
  // Four uniforms on [0, 1) have mean 2 and variance 4/12 = 1/3.
  return { value: (sum - 2) * SQRT_3, rng: current }
}

// MurmurHash3's 32-bit finalizer. It spreads every input bit across the output, so
// neighboring seeds and turns produce unrelated streams.
function fmix32(value: number): number {
  let h = value >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
