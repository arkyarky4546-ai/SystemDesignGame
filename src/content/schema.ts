// Content types. M5 replaces these with Zod schemas and infers the types from them
// (03-CONTENT-SCHEMA). Until then they hold only the fields something already reads.

export type ReviewStatus = 'needs-review' | 'reviewed'

/** Every component kind in the game. The engine's architecture types are keyed by this list. */
export const COMPONENT_KINDS = ['ingress', 'app-server', 'database'] as const

export type ComponentKind = (typeof COMPONENT_KINDS)[number]

/**
 * One size of a component (03-CONTENT-SCHEMA §5). The figures are placeholders until M7
 * balances them (ADR-0033).
 */
export type ComponentTier = {
  readonly label: string
  /** Throughput one instance sustains, rps. */
  readonly capacityRps: number
  /** Mean time to serve one request with no queueing, ms. */
  readonly serviceTimeMs: number
  /** One-time cost per instance, charged on the first turn it runs, integer cents. */
  readonly setupCostCents: number
  /** Cost per instance per turn, integer cents. */
  readonly runningCostPerTurnCents: number
  /**
   * The concept that has to be passed before this size can be chosen, or absent when it's
   * open from the start (00-GAME-DESIGN §4). The smallest size of a placeable component is
   * always open, or a new run couldn't build anything.
   */
  readonly gatedBy?: ConceptId
}

/**
 * A component definition (03-CONTENT-SCHEMA §5). This holds only the fields the game reads
 * (ADR-0027). M5 adds `description`, `gatedBy` and `configSchema`, and M7 balances each
 * tier's figures.
 */
export type ComponentDef = {
  readonly kind: ComponentKind
  readonly displayName: string
  /**
   * The concept that makes this kind placeable at all, or absent when it is available from
   * the start. 03-CONTENT-SCHEMA §5 requires it; every Tier 1 kind is already on the canvas,
   * so it stays optional until a kind arrives whole (ADR-0042).
   */
  readonly gatedBy?: ConceptId
  /** Whether the player can place and remove it. Ingress is where traffic arrives, so it is always present. */
  readonly placeable: boolean
  /**
   * Size options, smallest first. A node's `tier` indexes this list. Empty for kinds without
   * sizes. §5's `failureRatePerTurn` joins when failures are modeled (02-SIMULATION §5.7).
   */
  readonly tiers: readonly ComponentTier[]
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

// Concepts, lessons and checks (03-CONTENT-SCHEMA §1–4), written as the types M4b reads
// (ADR-0040). M5 replaces them with Zod schemas and adds the blocks, slot composition and
// question kinds nothing renders yet.

/** Every concept in the game. Ids are permanent: saves key unlocks and check history by them. */
export const CONCEPT_IDS = ['capacity-and-utilization', 'percentiles'] as const

export type ConceptId = (typeof CONCEPT_IDS)[number]

/**
 * A lesson block (03-CONTENT-SCHEMA §2). `diagram` and `demo` arrive in M6, which can render
 * them; until then a lesson says in prose what it would otherwise draw.
 */
export type Block =
  | { readonly kind: 'prose'; readonly text: string }
  | { readonly kind: 'formula'; readonly formula: string; readonly explanation: string }
  | { readonly kind: 'callout'; readonly tone: 'note' | 'warning'; readonly text: string }

/** A number worth remembering, with where it comes from. Questions reference these by tag. */
export type Fact = {
  readonly label: string
  readonly value: string
  /** Why the number is what it is, in one sentence. */
  readonly note: string
  /** The tag a question carries to count as covering this fact (09-QUESTION-BANK §7). */
  readonly tag: string
}

export type Misconception = {
  readonly claim: string
  readonly correction: string
  readonly tag: string
}

export type Lesson = {
  /** Everyone reads this. 250–450 words (03-CONTENT-SCHEMA §2). */
  readonly core: readonly Block[]
  /** Optional expansion, collapsed by default (05-UI-DESIGN §6). No length target. */
  readonly deeper?: readonly Block[]
  readonly keyNumbers: readonly Fact[]
  readonly misconceptions: readonly Misconception[]
}

/**
 * How a check is drawn. §5's mix of authored, derived and diagnose slots needs derived
 * questions, so `composition` arrives with them in M6 (ADR-0040). Until then every slot is
 * an authored question of an eligible depth.
 */
export type Check = {
  /** How many questions are asked. 3–6 (03-CONTENT-SCHEMA §3). */
  readonly drawCount: number
}

export type Depth = 1 | 2 | 3

export type Option = {
  readonly id: string
  readonly text: string
  /** Required on every incorrect option: the specific misunderstanding it comes from. */
  readonly whyWrong?: string
}

export type QuestionKind =
  | { readonly type: 'single'; readonly options: readonly Option[]; readonly correctId: string }
  | {
      readonly type: 'multi'
      readonly options: readonly Option[]
      readonly correctIds: readonly string[]
      readonly partialCredit: boolean
    }
  | { readonly type: 'numeric'; readonly answer: number; readonly tolerance: number; readonly unit: string }

/** How a question came to exist (09-QUESTION-BANK §10). */
export type Provenance = {
  readonly origin: 'authored' | 'derived' | 'diagnose'
  /** ISO date. */
  readonly generatedAt: string
  readonly generator: string
  /** Groups one generation session, so a bad question casts doubt on its batch. */
  readonly batchId: string
}

/** `needs-expert-review` marks an item whose author wasn't fully confident (09-QUESTION-BANK §8). */
export type QuestionReviewStatus = ReviewStatus | 'needs-expert-review'

export type Question = {
  /** Permanent, never reused: saves reference it for missed-question weighting (09-QUESTION-BANK §4.3). */
  readonly id: string
  readonly conceptId: ConceptId
  readonly depth: Depth
  readonly prompt: string
  readonly kind: QuestionKind
  /** Always shown after answering, right or wrong. */
  readonly explanation: string
  /** Drives draw diversity and the lesson-coverage check (09-QUESTION-BANK §7). */
  readonly tags: readonly string[]
  readonly status: 'active' | 'retired'
  readonly reviewStatus: QuestionReviewStatus
  readonly provenance: Provenance
}

export type Concept = {
  readonly id: ConceptId
  readonly tier: 1 | 2 | 3 | 4 | 5
  readonly title: string
  /** Shown on locked components. One sentence, no jargon. */
  readonly oneLiner: string
  readonly prerequisites: readonly ConceptId[]
  /**
   * What passing the check makes available (03-CONTENT-SCHEMA §1). Whole component kinds go
   * here; individual sizes are gated on `ComponentTier.gatedBy` instead, so a kind whose
   * smallest size is free can still have larger ones locked (ADR-0041).
   */
  readonly unlocks: { readonly components: readonly ComponentKind[] }
  readonly lesson: Lesson
  readonly check: Check
  readonly reviewStatus: ReviewStatus
  /** Where a human can verify the claims. */
  readonly sources?: readonly string[]
}
