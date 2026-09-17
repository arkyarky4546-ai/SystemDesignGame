import type { Concept } from '../../schema'

/**
 * Tier 1 (04-CURRICULUM): after this the player can explain why p99 matters more than the
 * mean to a user. The curriculum gives it the dashboard's p99 panel, which doesn't exist as
 * a gated thing yet, so it unlocks nothing in M5.
 *
 * Every claim it makes about the model comes from 02-SIMULATION §5.2 and §6, ADR-0009 (the
 * summed per-hop p99) and ADR-0022 (the quality multiplier's cap). Its arithmetic is
 * recomputed against the engine in `src/state/content-accuracy.test.ts`. Its prerequisite,
 * `latency-and-throughput`, doesn't exist yet and is waived until M7 (ADR-0040).
 */
export const percentiles = {
  id: 'percentiles',
  tier: 1,
  title: 'Why the average lies',
  oneLiner: 'The number that describes your service is not the number your users are complaining about.',
  prerequisites: [],
  unlocks: { components: [] },
  lesson: {
    core: [
      {
        kind: 'prose',
        text: 'Your average response time is 40 milliseconds and your support queue is full of people saying the site is slow. Both of those are true at once. The average is a figure almost nobody experiences: it sits above most requests and far below the worst ones, and the worst ones are what people write in about.',
      },
      {
        kind: 'formula',
        formula: 'p50 = W × ln 2 ≈ 0.69 × W',
        explanation:
          'Response time in this game’s queueing model is spread exponentially around its mean W, and that fixes where each percentile sits. The median lands at about 0.69 of the mean, so more than half of all requests beat the average.',
      },
      {
        kind: 'formula',
        formula: 'p99 = W × ln 100 ≈ 4.61 × W',
        explanation:
          'The 99th percentile lands at about 4.61 of that same mean. One request in a hundred is slower than it, and nothing in the figure says how much slower.',
      },
      {
        kind: 'prose',
        text: 'So a component with a 40 ms mean has a median near 28 ms and a p99 near 184 ms. Half your requests beat 28 ms. One in a hundred is slower than 184. The average of 40 describes neither group, and the gap between them is not noise you can average away — it is the shape of the distribution, and every queue has it.',
      },
      {
        kind: 'prose',
        text: 'The reason to watch the tail rather than the middle is that one user makes many requests. If each request has a one-in-a-hundred chance of landing past p99, a page view that makes ten of them has about a one-in-ten chance of containing one. At the level people actually experience a product, tail latency is not a rare event. It is a common one.',
      },
      {
        kind: 'callout',
        tone: 'note',
        text: 'This game judges you on p99 and never on the mean. The SLO is a p99 target, the revenue multiplier tracks p99, and reputation is lost when p99 goes over. Halving your median while the tail grows makes the weekly report worse, not better.',
      },
      {
        kind: 'prose',
        text: 'End to end, this game adds up each hop’s p99 along the request path. That overstates the real figure, because two hops are rarely slow on the same request and independent tails don’t add like that. It is deliberate: the estimate is conservative, and it keeps the lesson that every hop costs you something. Percentiles never average either — when several request classes carry traffic the report shows the worst one’s p99 rather than a blend, because a blended percentile is not a percentile of anything.',
      },
    ],
    keyNumbers: [
      {
        label: 'The median against the mean',
        value: 'about 0.69×',
        note: 'p50 = W × ln 2, so more than half of all requests are faster than average.',
        tag: 'median-vs-mean',
      },
      {
        label: 'p99 against the mean',
        value: 'about 4.6×',
        note: 'p99 = W × ln 100. The slowest one in a hundred waits far longer than the average does.',
        tag: 'p99-vs-mean',
      },
      {
        label: 'p99 against the median',
        value: 'about 6.6×',
        note: 'ln 100 ÷ ln 2. That ratio is the distance between a typical request and a bad one.',
        tag: 'p99-vs-p50',
      },
      {
        label: 'Chance a ten-request page view touches the tail',
        value: 'about 10%',
        note: '1 − 0.99¹⁰. Tail latency is common once you count whole page views rather than requests.',
        tag: 'tail-per-user',
      },
      {
        label: 'What the game judges you on',
        value: 'p99, never the mean',
        note: 'The SLO target, the revenue quality multiplier and reputation all read p99.',
        tag: 'p99-slo',
      },
      {
        label: 'End-to-end p99 in this game',
        value: 'the sum of each hop’s p99',
        note: 'An overestimate, kept because it is conservative and because it makes every hop cost something.',
        tag: 'end-to-end',
      },
    ],
    misconceptions: [
      {
        claim: 'The average response time is what a typical user sees.',
        correction:
          'The median is about 0.69 of the mean and the 99th percentile about 4.6 times it, so most requests beat the average and the slow ones miss it by a long way. The average describes neither group, which is why it can look fine while people complain.',
        tag: 'median-vs-mean',
      },
      {
        claim: 'A p99 of 200 ms means 99 out of 100 users are happy.',
        correction:
          'It means 99 of every 100 requests, not users. A page view that makes ten requests has about a one-in-ten chance of containing one past p99, so the share of sessions that meet the tail is far larger than one percent.',
        tag: 'tail-per-user',
      },
      {
        claim: 'You can average two components’ p99s to get the system’s.',
        correction:
          'Percentiles don’t average. This game sums each hop’s p99 along a path, which overstates the truth because independent tails don’t coincide, and it reports the worst request class’s p99 rather than a blend of the classes.',
        tag: 'end-to-end',
      },
    ],
  },
  check: { drawCount: 5 },
  reviewStatus: 'needs-review',
  sources: [
    'docs/02-SIMULATION.md §5.2 — p50 = W·ln 2 and p99 = W·ln 100, and §6 for the quality multiplier that reads p99.',
    'docs/08-DECISIONS.md ADR-0009 — end-to-end p99 is the sum of per-hop p99s, which overestimates on purpose.',
    'docs/08-DECISIONS.md ADR-0022 — the quality multiplier is capped at the SLO target, so beating it earns nothing more.',
    'Exponential distribution with mean W: the pth percentile is W × ln(1 ÷ (1 − p)); ln 2 ≈ 0.6931, ln 100 ≈ 4.6052, and their ratio is ≈ 6.644.',
  ],
} as const satisfies Concept
