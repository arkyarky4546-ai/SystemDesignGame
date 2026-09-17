import { COMPONENT_DEFS } from '../content/components'
import { COMPONENT_KINDS, type ComponentKind, type ConceptId, type GateConceptId } from '../content/schema'
import { hasPassed, type Knowledge } from '../engine'

// Which component sizes a player has earned (00-GAME-DESIGN §4). Components are locked
// behind concepts, and in M4b that gate sits on the size rather than the whole component:
// `capacity-and-utilization` opens app server sizes above Small (ADR-0040).

/** One size the player can't choose yet, and the concept that opens it. */
export type LockedTier = {
  /** Index into the component definition's `tiers`. */
  readonly index: number
  readonly label: string
  readonly gatedBy: ConceptId
}

/** The concept gating a size, or null when it's open from the start. */
export function tierGatedBy(kind: ComponentKind, index: number): ConceptId | null {
  return COMPONENT_DEFS[kind].tiers[index]?.gatedBy ?? null
}

/**
 * Whether the player can choose this size. A size with no gate is always available, and a
 * gated one opens once its concept's check has been passed — in this run or an earlier one.
 */
export function isTierUnlocked(knowledge: Knowledge, kind: ComponentKind, index: number): boolean {
  const gatedBy = tierGatedBy(kind, index)
  return gatedBy === null || hasPassed(knowledge, gatedBy)
}

/** Every size of this component the player hasn't earned yet, smallest first. */
export function lockedTiers(knowledge: Knowledge, kind: ComponentKind): readonly LockedTier[] {
  return COMPONENT_DEFS[kind].tiers.flatMap((tier, index) =>
    tier.gatedBy !== undefined && !hasPassed(knowledge, tier.gatedBy)
      ? [{ index, label: tier.label, gatedBy: tier.gatedBy }]
      : [],
  )
}

/**
 * The concept that would open the most sizes of this component, or null when none are
 * locked. In M4b one concept gates every locked app server size, so this is the one the
 * inspector names; M6 generalizes it as the catalog grows.
 */
export function nextConceptFor(knowledge: Knowledge, kind: ComponentKind): ConceptId | null {
  return lockedTiers(knowledge, kind)[0]?.gatedBy ?? null
}

/**
 * The most instances of this component the player may run (ADR-0050). One until a concept
 * opens more: `single-point-of-failure` opens the second — N+1 — and `horizontal-scaling`
 * lifts the cap. A gate naming a concept that isn't written yet can never be passed, so it
 * stays shut and the cap stays where it was.
 */
export function maxReplicas(knowledge: Knowledge, kind: ComponentKind): number {
  let cap = 1
  for (const gate of COMPONENT_DEFS[kind].replicaGates ?? []) {
    if (!hasPassed(knowledge, gate.gatedBy)) continue
    cap = gate.opens.kind === 'uncapped' ? Infinity : Math.max(cap, gate.opens.replicas)
  }
  return cap
}

/**
 * The concept that would open one more instance of this component, or null when the cap is
 * already lifted or nothing lifts it. Named by the inspector beside the instance count.
 */
export function nextReplicaConceptFor(knowledge: Knowledge, kind: ComponentKind): GateConceptId | null {
  const cap = maxReplicas(knowledge, kind)
  if (cap === Infinity) return null
  const gates = COMPONENT_DEFS[kind].replicaGates ?? []
  const shut = gates.filter((gate) => !hasPassed(knowledge, gate.gatedBy))
  // The gate that opens the fewest instances above today's cap is the next one to earn.
  const next = shut
    .filter((gate) => gate.opens.kind === 'uncapped' || gate.opens.replicas > cap)
    .sort((a, b) => (a.opens.kind === 'uncapped' ? Infinity : a.opens.replicas) - (b.opens.kind === 'uncapped' ? Infinity : b.opens.replicas))
  return next[0]?.gatedBy ?? null
}

/** One component size a concept opens, for naming what a pass just unlocked. */
export type UnlockedTier = { readonly kind: ComponentKind; readonly label: string; readonly displayName: string }

/** Every size across the catalog that this concept opens, smallest first within each kind. */
export function tiersUnlockedBy(conceptId: ConceptId): readonly UnlockedTier[] {
  return COMPONENT_KINDS.flatMap((kind) => {
    const def = COMPONENT_DEFS[kind]
    return def.tiers.flatMap((tier) =>
      tier.gatedBy === conceptId ? [{ kind, label: tier.label, displayName: def.displayName }] : [],
    )
  })
}
