import type { Concept } from '../../schema'

/**
 * Tier 1 (04-CURRICULUM): after this the player can compute the instances needed for a
 * target rps and headroom. It unlocks app server sizes above Small (ADR-0040).
 *
 * Every claim it makes about the model comes from 02-SIMULATION §5.2, and the arithmetic in
 * its prose is checked against the engine in `src/state/content-accuracy.test.ts`. Its
 * prerequisite, `latency-and-throughput`, doesn’t exist yet and is waived until M7
 * (ADR-0040).
 */
export const capacityAndUtilization = {
  id: 'capacity-and-utilization',
  tier: 1,
  title: 'Capacity, utilization, and the cliff',
  oneLiner: 'How close a component is to its limit decides how slow it feels, long before it runs out.',
  prerequisites: [],
  // It opens app server sizes rather than a component kind, so the gate is on the tiers.
  unlocks: { components: [] },
  lesson: {
    core: [
      {
        kind: 'prose',
        text: 'Your app server is turning requests away and nothing about it changed. It was fine last week. Traffic grew by a fifth, and now the weekly report shows p99 in the seconds and a sixth of your users getting an error. Nothing broke. You ran out of headroom, and the last stretch of it is worth far more than the first.',
      },
      {
        kind: 'formula',
        formula: 'utilization = requests received ÷ capacity',
        explanation:
          'Capacity is the requests per second a component serves at its chosen size. Utilization is the share of that you are using, measured at the week’s busiest hour rather than its average.',
      },
      {
        kind: 'prose',
        text: 'On its own that sounds harmless: 90% used, 10% spare. It isn’t, because response time doesn’t follow the spare capacity in proportion. It follows its reciprocal.',
      },
      {
        kind: 'formula',
        formula: 'W = service time ÷ (1 − utilization)',
        explanation:
          'W is the mean time a request spends at the component: its own service time, plus the time it waits behind requests that arrived first. This game uses the M/M/1 queue, the simplest model that shows the effect. Real components deviate from it, but not in the direction that saves you.',
      },
      {
        kind: 'prose',
        text: 'Read that as a curve rather than a formula. At 50% utilization a request takes twice its service time. At 90% it takes ten times. At 99% it takes a hundred times. The first half of your capacity is nearly free; the last few percent are where the latency your users actually feel gets decided. Percentiles make it sharper still: response times are spread exponentially around W, so p99 is about 4.6 times the mean. A component with a 12 ms service time running at 90% has a mean of 120 ms and a p99 of about 553 ms.',
      },
      { kind: 'demo', demoId: 'saturation' },
      {
        kind: 'diagram',
        architecture: {
          nodes: [
            { id: 'ingress', kind: 'ingress', tier: 0 },
            { id: 'app', kind: 'app-server', tier: 0 },
            { id: 'db', kind: 'database', tier: 0 },
          ],
          edges: [
            { from: 'ingress', to: 'app' },
            { from: 'app', to: 'db' },
          ],
        },
        caption: 'Every request crosses both. One the app server turns away never reaches the database.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        text: 'Past capacity the model stops queueing and starts refusing. Load above capacity is dropped where it arrives — dropped = received − capacity — and a dropped request never reaches the component behind it. That is why an overloaded app server can make a database look healthy, and why fixing the app server can overload the database in the same week.',
      },
      {
        kind: 'prose',
        text: 'So you size for the peak, not the mean, and you leave room: capacity ≥ peak ÷ the utilization you’re willing to run at. A 2,400/s peak at 80% needs 3,000/s of capacity. The cost of that room is real and you pay it weekly — it sits idle in every hour but the busiest. Buying down from 85% to 60% utilization takes about 1.4 times the capacity and buys a mean of 2.5 service times instead of 6.7. Whether that trade is worth making is your judgment, not the model’s.',
      },
    ],
    keyNumbers: [
      {
        label: 'Mean response time at 50%, 90% and 99% utilization',
        value: '2×, 10× and 100× the service time',
        note: 'W = service time ÷ (1 − u), so the multiplier is just 1 ÷ (1 − u).',
        tag: 'latency-curve',
      },
      {
        label: 'p99 against the mean',
        value: 'about 4.6×',
        note: 'Response time is exponential around W, so the 99th percentile is W × ln 100 ≈ 4.605 W.',
        tag: 'percentiles',
      },
      {
        label: 'Capacity needed for a target utilization',
        value: 'peak ÷ target',
        note: 'A 2,400/s peak at 80% needs 3,000/s. Dividing rather than multiplying is the step that gets reversed.',
        tag: 'capacity-math',
      },
      {
        label: 'Load above capacity',
        value: 'dropped, not delayed',
        note: 'dropped = received − capacity, and those requests never reach the next component.',
        tag: 'drops',
      },
      {
        label: 'What the week is resolved at',
        value: 'the peak hour',
        note: 'A tier sized for the weekly mean is short by the whole peak multiplier when the busy hour arrives.',
        tag: 'peak-vs-mean',
      },
    ],
    misconceptions: [
      {
        claim: 'A component at 100% utilization is being used efficiently.',
        correction:
          'At 100% there is no idle time for the queue to recover in, and W = service time ÷ (1 − u) has no finite value at u = 1. This game caps utilization at 99% and turns away everything above capacity, so a component pinned there is losing requests, not using itself well.',
        tag: 'saturation',
      },
      {
        claim: 'Doubling a component’s capacity halves its response time.',
        correction:
          'It depends entirely where on the curve you start. Doubling capacity at 50% utilization takes the mean from 2× the service time to about 1.3×. Doubling it at 95% takes the mean from 20× to about 1.9×. The same money, spent the same way, barely moves the first component and rescues the second.',
        tag: 'latency-curve',
      },
      {
        claim: 'Sizing for average traffic is enough, because the peaks are brief.',
        correction:
          'Every latency and error figure in this game is resolved at the week’s busiest hour. A tier sized for a 400/s mean against a 2.5× peak meets 1,000/s and turns away 600/s of it, which is an error rate of 60% for the week.',
        tag: 'peak-vs-mean',
      },
    ],
  },
  check: { drawCount: 5 },
  reviewStatus: 'needs-review',
  sources: [
    'docs/02-SIMULATION.md §5.2 — the capacity, utilization, latency and drop formulas this lesson describes.',
    'M/M/1 queue: mean response time W = 1 ÷ (μ − λ) = service time ÷ (1 − u). Response time is exponentially distributed with mean W, so the pth percentile is W × ln(1 ÷ (1 − p)); ln 2 ≈ 0.693 and ln 100 ≈ 4.605.',
  ],
} as const satisfies Concept
