import type { Concept } from '../../schema'

/**
 * Tier 1 (04-CURRICULUM): after this the player can say where vertical scaling stops helping
 * and why. It opens the database sizes above Small, which the curriculum gives to this concept
 * once `capacity-and-utilization` has opened the app server's (ADR-0040).
 *
 * Every claim about the game — the latency floor, what doubling capacity buys, the largest
 * sizes, the bottleneck that moves, prices rising with size — is recomputed against the
 * engine and the component definitions in `src/state/content-accuracy.test.ts`. The lesson
 * says nothing about price per request served: the placeholder tiers get cheaper per request
 * as they grow, which real clouds don't do, and that is M9's to settle (ADR-0048).
 */
export const verticalScaling = {
  id: 'vertical-scaling',
  tier: 1,
  title: 'Making the box bigger',
  oneLiner: 'A bigger size buys room for more traffic, not a faster request, and there is always a biggest size.',
  prerequisites: ['capacity-and-utilization'],
  unlocks: { components: [] },
  lesson: {
    core: [
      {
        kind: 'prose',
        text: 'Your database is at 94% and every page is slow. The inspector offers a bigger size, and it works: utilization falls, p99 falls with it, and the next report is quiet. That is vertical scaling — the same component, one size up — and it is usually the right first move. It is also a move that runs out.',
      },
      {
        kind: 'prose',
        text: 'What a bigger size buys is capacity. In this game the smallest app server serves 10 requests a second and the largest 500, while the time to serve one request only falls from 12 ms to 10. So an upgrade helps exactly as much as it moves you down the utilization curve. Doubling capacity at 95% takes the mean response time from 20 service times to under 2. Doubling it at 30% takes it from 1.43 to 1.18.',
      },
      {
        kind: 'formula',
        formula: 'lowest possible p99 = service time × ln 100 ≈ 4.6 × service time',
        explanation:
          'With nothing queued, a request still takes its service time, and in this game’s model the spread around it still has a tail. No size gets p99 below this; for the largest app server here it is about 46 ms.',
      },
      { kind: 'demo', demoId: 'vertical-scaling' },
      {
        kind: 'prose',
        text: 'There is also a biggest size. Here the largest app server serves 500/s and the largest database 600/s, and nothing on the menu is bigger. Real machines stop somewhere too, and well before they do, doubling a machine’s cores often less than doubles what it serves: work that must happen one step at a time, or wait its turn for a shared lock, doesn’t go faster with more cores.',
      },
      {
        kind: 'prose',
        text: 'An upgrade can also move the problem instead of solving it. An app server past its capacity drops requests before they reach the database, so the database looks healthy. Upgrade the app server and everything it used to drop arrives downstream, and the database that looked fine is the one turning users away.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        text: 'A bigger box is still one box. When a real machine fails, its size doesn’t matter: everything that depends on it stops with it.',
      },
      {
        kind: 'prose',
        text: 'And the room you buy is paid for all week. You size for the busiest hour, so the extra capacity sits idle in every other hour, and each size up costs more per week than the one before. Vertical scaling is where scaling starts, not where it ends.',
      },
    ],
    deeper: {
      summary: 'Amdahl’s law: why doubling a machine’s cores often less than doubles its throughput.',
      blocks: [
        {
          kind: 'formula',
          formula: 'speedup with n cores ≤ 1 ÷ (s + (1 − s) ÷ n)',
          explanation:
            's is the share of the work that has to run one step at a time. However large n gets, the speedup never passes 1 ÷ s. Amdahl stated it for one job; Gunther’s Universal Scalability Law gives the same bound for throughput when requests contend for that serial part.',
        },
        {
          kind: 'prose',
          text: 'If 5% of the work is serial, 8 cores give at most about 5.9 times the throughput of one, 32 cores about 12.5 times, and no number of cores ever reaches 20. Real servers also lose ground to coordination between cores as they grow, so the curve is often worse than this. This game’s sizes model none of it: each size simply has the capacity it lists.',
        },
      ],
    },
    keyNumbers: [
      {
        label: 'Lowest p99 any size reaches',
        value: 'about 4.6 × the service time',
        note: 'With nothing queued the mean is the service time, and p99 is the mean × ln 100. The largest app server’s floor is about 46 ms.',
        tag: 'latency-floor',
      },
      {
        label: 'What a bigger size does to the mean',
        value: 'service time ÷ (1 − the new, lower utilization)',
        note: 'Doubling capacity at 95% takes the mean from 20 service times to 1.9; at 30%, from 1.43 to 1.18. The busier you were, the more it buys.',
        tag: 'upgrade-gain',
      },
      {
        label: 'The largest sizes here',
        value: '500/s app server, 600/s database',
        note: 'Nothing bigger is for sale, and load above capacity is dropped.',
        tag: 'size-ceiling',
      },
      {
        label: 'Load an upgrade sends downstream',
        value: 'everything the old size dropped',
        note: 'Drops never reach the next component, so fixing the front one can overload the one behind it.',
        tag: 'bottleneck-moves',
      },
    ],
    misconceptions: [
      {
        claim: 'A bigger size makes each request faster.',
        correction:
          'It mostly makes room. Service time barely changes between sizes, so once utilization is low an upgrade buys almost nothing, and p99 never falls below about 4.6 service times whatever you buy.',
        tag: 'latency-floor',
      },
      {
        claim: 'Upgrading the busiest component fixes the system.',
        correction:
          'It fixes that component and sends everything it was dropping to the next one. A database behind an overloaded app server can go from quiet to saturated in the same week.',
        tag: 'bottleneck-moves',
      },
      {
        claim: 'You can keep scaling up for as long as you can pay.',
        correction:
          'Every catalog has a largest size, and here it is 500/s for an app server. Past it no upgrade exists, and serving more takes more than one server side by side, which is where Tier 2 begins.',
        tag: 'size-ceiling',
      },
    ],
  },
  check: { drawCount: 5 },
  reviewStatus: 'needs-review',
  sources: [
    'docs/02-SIMULATION.md §5.2 — W = service time ÷ (1 − u), p99 = W × ln 100, and drops that never reach the next hop; §8 names the masked bottleneck.',
    'src/content/components/app-server.ts and database.ts — the size figures the lesson quotes.',
    'Gene M. Amdahl, “Validity of the single processor approach to achieving large scale computing capabilities”, AFIPS Spring Joint Computer Conference, 1967.',
    'Neil J. Gunther, Guerrilla Capacity Planning (Springer, 2007) — the Universal Scalability Law, which with no coherency term reduces to Amdahl’s form for throughput.',
  ],
} as const satisfies Concept
