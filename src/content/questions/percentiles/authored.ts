import type { Question } from '../../schema'

// Authored questions for `percentiles` (09-QUESTION-BANK §2.2). One batch of 15, every one
// `needs-review` until a human reads it.
//
// Every number is arithmetic on 02-SIMULATION §5.2 and §6, recomputed against the engine in
// `src/state/content-accuracy.test.ts`. Depth mix: 4 at depth 1, 8 at depth 2, 3 at depth 3,
// which holds every difficulty's eligible pool at twice the draw count or more.

const provenance = {
  origin: 'authored',
  generatedAt: '2026-09-16',
  generator: 'claude-code/opus-5',
  batchId: 'b-0002-percentiles',
} as const

export const percentilesAuthored = [
  {
    id: 'q-percentiles-a-0001',
    conceptId: 'percentiles',
    depth: 1,
    prompt: 'Response times in this game are spread exponentially around the mean. Where does the median of a component’s response times sit relative to that mean?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'At about 0.69 of the mean' },
        {
          id: 'b',
          text: 'Exactly at the mean',
          whyWrong: 'That holds for a symmetric spread. An exponential one has a long right tail, which drags the mean above the middle.',
        },
        {
          id: 'c',
          text: 'At about 1.4 times the mean',
          whyWrong: 'This has the relationship inverted. The median sits below the mean, not above it.',
        },
        {
          id: 'd',
          text: 'At about 4.6 times the mean',
          whyWrong: 'That is where the 99th percentile sits. The median is far lower, at ln 2 ≈ 0.693 of the mean.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'For an exponential spread with mean W, the median is W × ln 2 ≈ 0.693 W. The tail pulls the mean above the middle, so more than half of all requests are faster than the average.',
    tags: ['median-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0002',
    conceptId: 'percentiles',
    depth: 1,
    prompt: 'A component reports a p99 of 200 ms in the weekly report. What does that figure actually say about the component?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: '99 of every 100 requests took 200 ms or less' },
        {
          id: 'b',
          text: '99% of users had a good experience',
          whyWrong: 'A percentile counts requests, not users. One user makes many requests, so the share of sessions that meet the tail is much higher than 1%.',
        },
        {
          id: 'c',
          text: 'The slowest request took 200 ms',
          whyWrong: 'That would be the maximum. One request in a hundred is slower than p99, and nothing here says how much slower.',
        },
        {
          id: 'd',
          text: 'The average request took 200 ms',
          whyWrong: 'The mean is a separate figure, about 4.6 times smaller than p99 under this spread.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'A percentile is a cut point on the distribution of requests. p99 is the time 99 of every 100 requests come in under. It says nothing about how slow the remaining one is, and nothing directly about users.',
    tags: ['p99-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0003',
    conceptId: 'percentiles',
    depth: 1,
    prompt: 'Over one week your median response time falls and your p99 rises. What happens to the weekly report’s SLO and to revenue?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Both get worse, because the game reads p99' },
        {
          id: 'b',
          text: 'Both improve, because most requests got faster',
          whyWrong: 'Most requests are not what is measured. The SLO target and the revenue multiplier are both set on p99.',
        },
        {
          id: 'c',
          text: 'The SLO worsens, but revenue is untouched',
          whyWrong: 'Revenue’s quality multiplier tracks p99 as well, so it falls with the same figure that missed the SLO.',
        },
        {
          id: 'd',
          text: 'Neither changes, since the mean is unchanged',
          whyWrong: 'Nothing in the report reads the mean. p99 moved, so every figure that depends on it moved.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'The SLO is a p99 target, and the revenue quality multiplier falls as p99 climbs above it. Reputation follows the SLO. Improving the median while the tail grows makes all three worse.',
    tags: ['p99-slo'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0004',
    conceptId: 'percentiles',
    depth: 1,
    prompt: 'A request passes through several components before it is answered. How does this game work out the end-to-end p99 of that path?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'It adds up each hop’s p99' },
        {
          id: 'b',
          text: 'It takes the largest hop’s p99',
          whyWrong: 'That would hide every other hop. The game sums them, so each hop visibly costs you something.',
        },
        {
          id: 'c',
          text: 'It averages the hops’ p99s',
          whyWrong: 'Percentiles don’t average. An average of two percentiles is not a percentile of anything.',
        },
        {
          id: 'd',
          text: 'It re-derives p99 from the summed means',
          whyWrong: 'That would be the fairer estimate, and it is not what the game does. It sums the per-hop p99s instead.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Each hop’s p99 is added along the path. That overstates the true end-to-end figure, because two hops are rarely slow on the same request. The overstatement is deliberate: it is conservative, and it teaches that every hop costs.',
    tags: ['end-to-end'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0005',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A component’s mean response time is 40 ms, and its response times are spread exponentially around that mean. What is its p99, in milliseconds, to the nearest millisecond?',
    kind: { type: 'numeric', answer: 184, tolerance: 2, unit: 'ms' },
    explanation:
      'p99 = mean × ln 100 ≈ 40 × 4.605 = 184 ms. The median of the same component is 40 × ln 2 ≈ 28 ms, so the figure a user in the tail waits is more than six times the typical one.',
    tags: ['p99-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0006',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A component reports a p99 of 460 ms. Working back through the same exponential spread, what is its mean response time, in milliseconds, to the nearest millisecond?',
    kind: { type: 'numeric', answer: 100, tolerance: 2, unit: 'ms' },
    explanation:
      'The mean is p99 ÷ ln 100 ≈ 460 ÷ 4.605 = 100 ms. Going the other way is the more common mistake: multiplying by 4.605 gives 2,118 ms, which is the p99 of a component four times slower than this one.',
    tags: ['p99-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0007',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A component has a service time of 15 ms and runs at 80% utilization at peak. What is its p50 at that load, in milliseconds, to the nearest millisecond?',
    kind: { type: 'numeric', answer: 52, tolerance: 2, unit: 'ms' },
    explanation:
      'Two steps. The mean is W = 15 ÷ (1 − 0.80) = 75 ms, and the median is W × ln 2 ≈ 75 × 0.693 = 52 ms. Its p99, on the same mean, is about 345 ms.',
    tags: ['median-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0008',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A component’s p50 is 30 ms. Under the same exponential spread, how many times its p50 is its p99? Give the ratio to one decimal place.',
    kind: { type: 'numeric', answer: 6.6, tolerance: 0.2, unit: '×' },
    explanation:
      'The ratio is ln 100 ÷ ln 2 ≈ 4.605 ÷ 0.693 ≈ 6.6, whatever the component’s mean is. So this one’s p99 is near 199 ms while its typical request finishes in 30.',
    tags: ['p99-vs-p50'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0009',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A request passes through two components, each reporting a p99 of 120 ms at peak. What end-to-end p99 does this game report for that path, in milliseconds?',
    kind: { type: 'numeric', answer: 240, tolerance: 0, unit: 'ms' },
    explanation:
      'The game sums the hops: 120 + 120 = 240 ms. The real end-to-end p99 would be lower, since both hops are rarely slow on the same request, and the game keeps the conservative figure on purpose.',
    tags: ['end-to-end'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0010',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'A page view makes 20 requests, and each has a one-in-a-hundred chance of being slower than p99. What percentage of page views contain at least one such request? Give it to one decimal place.',
    kind: { type: 'numeric', answer: 18.2, tolerance: 0.3, unit: '%' },
    explanation:
      'The chance every request is fast is 0.99²⁰ ≈ 0.818, so about 18.2% of page views contain at least one tail request. A figure that sounds like a 1% problem per request is a one-in-five problem per page.',
    tags: ['tail-per-user'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0011',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'Component A has a mean response time of 50 ms. Component B has a mean of 20 ms and a service time twice A’s. Which of the two has the higher p99?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'A, because p99 follows the mean' },
        {
          id: 'b',
          text: 'B, because its service time is larger',
          whyWrong: 'Service time is only one input to the mean. Once the mean is known, p99 follows from it alone, whatever produced it.',
        },
        {
          id: 'c',
          text: 'They are the same, since p99 is a fixed target',
          whyWrong: 'p99 is a measurement. The target is a separate number the SLO compares that measurement against.',
        },
        {
          id: 'd',
          text: 'It cannot be worked out without both utilizations',
          whyWrong: 'Utilization is how you get the mean, and both means are already given. p99 needs nothing else.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'p99 is the mean times ln 100 ≈ 4.605, whatever mix of service time and utilization produced that mean. A’s 50 ms mean gives about 230 ms; B’s 20 ms mean gives about 92 ms.',
    tags: ['p99-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0012',
    conceptId: 'percentiles',
    depth: 2,
    prompt: 'Two hops sit on one request path. One reports a p99 of 400 ms, the other 40 ms. You can halve exactly one hop’s mean. Which does more for the end-to-end p99?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'The 400 ms hop, which removes about 200 ms' },
        {
          id: 'b',
          text: 'The 40 ms hop, since small numbers are easier to move',
          whyWrong: 'Halving it removes about 20 ms against the other’s 200. How easy a change is isn’t in this figure.',
        },
        {
          id: 'c',
          text: 'Either, because the game sums the two hops',
          whyWrong: 'It does sum them, which is exactly why the larger term dominates the total.',
        },
        {
          id: 'd',
          text: 'Neither, because the worst hop alone sets p99',
          whyWrong: 'The game adds each hop’s p99 rather than taking the worst, so both terms are in the total.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'End to end the path is 440 ms. Halving a hop’s mean halves its p99, so fixing the large hop gives 200 + 40 = 240 ms, and fixing the small one gives 400 + 20 = 420 ms. The milliseconds are in the big term.',
    tags: ['end-to-end'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0013',
    conceptId: 'percentiles',
    depth: 3,
    prompt: 'Your service p99 is 280 ms against a 300 ms target, and your median is 42 ms. Select every statement that is true of that week.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'The p99 target is met, so the tail is not costing you reputation' },
        { id: 'b', text: 'Pushing p99 further below the target earns no extra revenue' },
        { id: 'c', text: 'One request in a hundred still takes longer than 280 ms' },
        {
          id: 'd',
          text: '99% of your users had every request finish under 280 ms',
          whyWrong: 'p99 counts requests, not users. A user making many requests is far likelier than one percent to meet the tail.',
        },
        {
          id: 'e',
          text: 'The 42 ms median shows the tail is under control',
          whyWrong: 'The median says nothing about the tail. Both come from the same spread, but only p99 is what the SLO and revenue read.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'The quality multiplier is capped at the target, so everything at or under 300 ms earns the same. The target being met is what protects reputation. And p99 is a cut point, not a ceiling: one request in a hundred is still slower, by an amount the figure doesn’t bound.',
    tags: ['p99-slo', 'tail-per-user'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0014',
    conceptId: 'percentiles',
    depth: 3,
    prompt: 'Your service p99 comes in at 600 ms against a 300 ms target. Select every statement that is true of the week you just ran.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'Revenue per request falls, because the quality multiplier tracks p99' },
        { id: 'b', text: 'Reputation falls, which slows next week’s traffic growth' },
        { id: 'c', text: 'The median is near 90 ms, so most requests were still fast' },
        {
          id: 'd',
          text: 'The quality multiplier has reached its floor',
          whyWrong: 'The floor arrives at 2.75 times the target, which is 825 ms. At 600 ms it is still falling, so more latency still costs more revenue.',
        },
        {
          id: 'e',
          text: 'Getting p99 to 250 ms would earn more than getting it to 300 ms',
          whyWrong: 'The multiplier is capped at the target, so beating 300 ms earns nothing extra. Every figure at or under the target is worth the same.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'At twice the target the multiplier is 1.6 − 0.4 × 2 = 0.8 rather than the 1.2 it would be at target, a third less revenue for the same served traffic. Missing the SLO costs reputation, which scales next week’s traffic. The median stays low throughout, which is why watching it would have told you nothing.',
    tags: ['p99-slo', 'median-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-percentiles-a-0015',
    conceptId: 'percentiles',
    depth: 3,
    prompt: 'Two components on one path each report a p99 of 150 ms, and the end-to-end p99 lands at 300 ms, exactly on target. Select every statement that is true.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'The summed figure overstates the path’s real p99' },
        { id: 'b', text: 'A week that raises either component’s utilization breaks the target' },
        { id: 'c', text: 'Each component’s median is near 23 ms' },
        {
          id: 'd',
          text: 'A blended p99 across the two hops would be the honest figure',
          whyWrong: 'Percentiles don’t blend. No average of two hops’ percentiles is itself a percentile of the path.',
        },
        {
          id: 'e',
          text: 'Each component’s median is also 150 ms',
          whyWrong: 'The median is about 0.15 of the p99 under this spread, so each sits nearer 23 ms than 150.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'The path’s figure is the sum, with no room left in it. It is also an overestimate, since two independent tails rarely coincide — the game keeps the conservative number deliberately. Both medians are about 150 × ln 2 ÷ ln 100 ≈ 23 ms, which is why the middle of the distribution would have told you the path was fine.',
    tags: ['end-to-end', 'p99-vs-p50'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
] as const satisfies readonly Question[]
