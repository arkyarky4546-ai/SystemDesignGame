// Content types. M5 replaces these with Zod schemas and infers the types from them
// (03-CONTENT-SCHEMA). Until then they hold only the fields something already reads.

export type ReviewStatus = 'needs-review' | 'reviewed'

/** Every component kind in the game. The engine's architecture types are keyed by this list. */
export const COMPONENT_KINDS = ['ingress', 'app-server', 'database'] as const

export type ComponentKind = (typeof COMPONENT_KINDS)[number]

/**
 * A component definition (03-CONTENT-SCHEMA §5). This holds only the fields the canvas
 * reads (ADR-0027). M5 adds `description`, `gatedBy` and `configSchema`, and M7 adds each
 * tier's figures.
 */
export type ComponentDef = {
  readonly kind: ComponentKind
  readonly displayName: string
  /** Whether the player can place and remove it. Ingress is where traffic arrives, so it is always present. */
  readonly placeable: boolean
  /** Size options, smallest first. A node's `tier` indexes this list. Empty for kinds without sizes. */
  readonly tiers: readonly { readonly label: string }[]
  readonly validConnections: {
    /** Kinds this component accepts requests from. */
    readonly upstream: readonly ComponentKind[]
    /** Kinds this component sends requests to. */
    readonly downstream: readonly ComponentKind[]
    /**
     * For every kind not in `downstream`: why this component can't send it requests, and
     * what to do instead. The canvas shows it when it refuses a connection. Not yet in
     * 03-CONTENT-SCHEMA §5 (ADR-0027).
     */
    readonly refusedDownstream: Readonly<Partial<Record<ComponentKind, string>>>
  }
  readonly reviewStatus: ReviewStatus
}
