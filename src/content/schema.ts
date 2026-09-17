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

/**
 * Every concept in the game, in curriculum order, which is the order the library lists them.
 * Ids are permanent: saves key unlocks and check history by them. Tier 1's
 * `single-point-of-failure` is not here yet: it needs a failure model the game doesn't have
 * (ADR-0047).
 */
export const CONCEPT_IDS = [
  'client-server-basics',
  'latency-and-throughput',
  'capacity-and-utilization',
  'percentiles',
  'vertical-scaling',
] as const

export type ConceptId = (typeof CONCEPT_IDS)[number]

/** A lesson block (03-CONTENT-SCHEMA §2). */
export type Block =
  | { readonly kind: 'prose'; readonly text: string }
  | { readonly kind: 'formula'; readonly formula: string; readonly explanation: string }
  | { readonly kind: 'callout'; readonly tone: 'note' | 'warning'; readonly text: string }
  /** Rendered by the real canvas component, so a diagram can't show what the game can't build. */
  | { readonly kind: 'diagram'; readonly architecture: DiagramSpec; readonly caption: string }
  /** One slider over the real engine (§7). */
  | { readonly kind: 'demo'; readonly demoId: DemoId }

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
  /**
   * Optional expansion, collapsed by default with a one-line summary of what's inside, so
   * skipping it is an informed choice (05-UI-DESIGN §6). No length target.
   */
  readonly deeper?: { readonly summary: string; readonly blocks: readonly Block[] }
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
  /** Derived only: the template that produced it. A draw never takes two from one template (§5). */
  readonly templateId?: string
  /**
   * Derived only: the parameters this instance was sampled with. The screener recomputes the
   * answer from them through the engine, which is what makes a derived question provably
   * correct rather than trusted (§7).
   */
  readonly params?: Readonly<Record<string, number>>
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

// Derived questions (09-QUESTION-BANK §2.1). A template declares parameter ranges and how to
// build a question from one sample; the generator freezes `instanceCount` of them into
// `derived.json`. The answer is computed by the real simulation engine, which is injected
// rather than imported, because content is the bottom layer and may not reach the engine.

/** One sampled parameter set, keyed by the `ParamSpec` name. */
export type Params = Readonly<Record<string, number>>

export type ParamSpec =
  | { readonly kind: 'int'; readonly name: string; readonly min: number; readonly max: number; readonly step: number }
  | { readonly kind: 'choice'; readonly name: string; readonly values: readonly number[] }

/**
 * The slice of the engine a template may call. Every function here is the same one the game
 * resolves turns with, so a derived question and the simulation cannot disagree.
 */
export type TemplateEngine = {
  /** Utilization from load and capacity, both rps. Unitless, capped as the resolver caps it. */
  utilization: (inboundRps: number, capacityRps: number) => number
  /** Mean response time W, ms, from a service time in ms and a utilization 0..1. */
  meanResponseTimeMs: (serviceTimeMs: number, u: number) => number
  /** Median response time, ms, from the mean W in ms. */
  p50LatencyMs: (meanMs: number) => number
  /** 99th-percentile response time, ms, from the mean W in ms. */
  p99LatencyMs: (meanMs: number) => number
  /** Instances needed for a peak in rps at a target utilization 0..1. */
  instancesNeeded: (peakRps: number, perInstanceRps: number, targetUtilization: number) => number
  /**
   * Resolves a whole request path with the game's own turn resolver, so a question about
   * what reaches the database, what is dropped, or what the path's p99 is gets the same
   * answer a week in the game would.
   */
  resolvePath: (path: PathSpec) => PathFigures
}

/** One component on a path a template resolves. */
export type PathHop = {
  /** Throughput the component sustains, rps. */
  readonly capacityRps: number
  /** Mean time to serve one request with no queueing, ms. */
  readonly serviceTimeMs: number
}

/** A request path as the game resolves it: ingress, one or more app servers, then the database. */
export type PathSpec = {
  /** Load arriving from ingress at the busiest hour, rps. */
  readonly peakRps: number
  /** App servers in request order, each with the queries it sends on per request it serves. */
  readonly appServers: readonly (PathHop & { readonly queriesPerRequest: number })[]
  readonly database: PathHop
}

/** One component on a resolved path, at peak. Rates are rps, times ms, utilization 0..1. */
export type HopFigures = {
  readonly inboundRps: number
  readonly servedRps: number
  readonly droppedRps: number
  readonly utilization: number
  readonly meanMs: number
  readonly p50Ms: number
  readonly p99Ms: number
}

/** A resolved path at peak. */
export type PathFigures = {
  readonly appServers: readonly HopFigures[]
  readonly database: HopFigures
  /** Requests that crossed every hop without being dropped, rps. */
  readonly completedRps: number
  /** Share of requests dropped somewhere on the path, 0..1. */
  readonly errorRate: number
  /** End-to-end p50 and p99, ms: the sum of every hop's, as the game reports them (ADR-0009). */
  readonly p50Ms: number
  readonly p99Ms: number
}

/**
 * A wrong answer that is the arithmetic consequence of one nameable mistake, so `whyWrong`
 * is guaranteed accurate (09-QUESTION-BANK §2.1). Returning null drops the distractor for
 * that instance, which is how a rule that doesn't apply to some parameters bows out.
 */
export type DistractorRule = {
  /** The mistake, for the generation log: 'forgot headroom'. */
  readonly label: string
  readonly compute: (params: Params, correct: number, engine: TemplateEngine) => number | null
  readonly whyWrong: string
}

/** What one sampled instance turns into, before the generator adds ids, options and metadata. */
export type GeneratedQuestion = {
  readonly prompt: string
  /** The correct value, in `unit`. */
  readonly answer: number
  /** How the value is written in an option: "3", "85%", "184 ms". */
  readonly format: (value: number) => string
  readonly explanation: string
  readonly tags: readonly string[]
}

export type QuestionTemplate = {
  /** Stable: it is part of every instance's id, and saves reference those ids. */
  readonly id: string
  readonly conceptId: ConceptId
  readonly depth: Depth
  readonly params: readonly ParamSpec[]
  /** Rejects nonsense parameter combinations before the question is built. */
  readonly constraints?: (params: Params) => boolean
  readonly build: (params: Params, engine: TemplateEngine) => GeneratedQuestion
  /** How many instances to freeze into the bank. */
  readonly instanceCount: number
  readonly distractors: readonly DistractorRule[]
  /**
   * A template is what a human reviews: approving it approves every instance it produced,
   * because the engine computed them (09-QUESTION-BANK §8). The generator stamps this onto
   * each instance, so `derived.json` stays generated and is never hand-edited.
   */
  readonly reviewStatus: ReviewStatus
  /** A retired template still generates its instances, retired, so their ids are never reused. */
  readonly status: 'active' | 'retired'
}

/** The parameter names a spec list declares, as a union of string literals. */
type NamesOf<S extends readonly ParamSpec[]> = S[number]['name']

/**
 * Declares one template with its parameter names known to the type checker, so `build` and
 * every distractor read `params.meanRps` as a number rather than a maybe-number. The
 * generator supplies every name the spec list declares, which is what makes that safe.
 */
export function defineTemplate<const S extends readonly ParamSpec[]>(template: {
  readonly id: string
  readonly conceptId: ConceptId
  readonly depth: Depth
  readonly reviewStatus: ReviewStatus
  readonly status: 'active' | 'retired'
  readonly params: S
  readonly constraints?: (params: Readonly<Record<NamesOf<S>, number>>) => boolean
  readonly build: (params: Readonly<Record<NamesOf<S>, number>>, engine: TemplateEngine) => GeneratedQuestion
  readonly instanceCount: number
  readonly distractors: readonly {
    readonly label: string
    readonly compute: (
      params: Readonly<Record<NamesOf<S>, number>>,
      correct: number,
      engine: TemplateEngine,
    ) => number | null
    readonly whyWrong: string
  }[]
}): QuestionTemplate {
  return template as QuestionTemplate
}

// Lesson diagrams and demos (03-CONTENT-SCHEMA §2, §7). Both describe an architecture as a
// recipe rather than as a built `Architecture` value: the engine's `Architecture` lives a
// layer up, and canvas positions are the layout's job rather than an author's (ADR-0046).
// The UI turns a recipe into a real `Architecture`, so a lesson diagram can still be loaded
// straight onto the player's canvas.

export type DiagramNode = {
  readonly id: string
  readonly kind: ComponentKind
  /** Index into the kind's `tiers`. */
  readonly tier: number
}

export type DiagramEdge = { readonly from: string; readonly to: string }

export type DiagramSpec = {
  readonly nodes: readonly DiagramNode[]
  readonly edges: readonly DiagramEdge[]
}

/** A figure a demo can show, named for the `NodeMetrics` field it reads. */
export type MetricId = 'utilization' | 'meanMs' | 'p50Ms' | 'p99Ms' | 'errorRate'

/**
 * One slider over one architecture, with the figures it moves (03-CONTENT-SCHEMA §7). §7
 * writes the variable as a string path; a union is used instead so the renderer can't be
 * handed a path nothing reads.
 */
export type Demo = {
  readonly id: string
  readonly architecture: DiagramSpec
  readonly variable:
    | { readonly kind: 'meanRps'; readonly min: number; readonly max: number; readonly step: number; readonly label: string }
    | {
        /** The slider resizes one node while the load holds still. */
        readonly kind: 'capacityRps'
        readonly nodeId: string
        /** The load the node takes the whole time, rps. */
        readonly loadRps: number
        readonly min: number
        readonly max: number
        readonly step: number
        readonly label: string
      }
  /** The node whose figures are shown. */
  readonly nodeId: string
  readonly showMetrics: readonly MetricId[]
  readonly caption: string
}

/** Every demo in the game. Adding an id fails typecheck until `DEMOS` has one. */
export const DEMO_IDS = ['saturation', 'vertical-scaling'] as const

export type DemoId = (typeof DEMO_IDS)[number]
