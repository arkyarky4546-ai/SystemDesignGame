import type { Concept } from '../../schema'

/**
 * Tier 1 (04-CURRICULUM): after this the player can trace a request through their
 * architecture and name each hop. It is the root of the curriculum and unlocks nothing.
 *
 * What it says about the game comes from 02-SIMULATION §4–5 and ADR-0009, and is recomputed
 * against the engine in `src/state/content-accuracy.test.ts`. What it says about real
 * requests — DNS, connections, distance, the reference latencies — is general knowledge the
 * game deliberately doesn't model (§10), and is sourced below for a human to check.
 */
export const clientServerBasics = {
  id: 'client-server-basics',
  tier: 1,
  title: 'What a request actually does',
  oneLiner: 'Every click is a request that crosses several machines, and each crossing costs time and can fail.',
  prerequisites: [],
  unlocks: { components: [] },
  lesson: {
    core: [
      {
        kind: 'prose',
        text: 'A user taps a button and waits 400 milliseconds for the page. That time wasn’t spent in one place. The request reached your ingress, waited for an app server, ran your code, waited for the database, and came back. Before you can make that page faster, or find out why it failed, you need to know which hop the time — or the failure — belongs to.',
      },
      {
        kind: 'prose',
        text: 'A request is one message asking for one thing, and the response is the answer. A client, such as a browser or a phone app, sends it; a server does the work and replies. One page view is usually many requests: the page, then the scripts, images and data it asks for. Your architecture handles them one at a time, many times a second.',
      },
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
        caption: 'The path every request takes in this game. Each arrow is a hop, and each hop is a place a request can wait or be turned away.',
      },
      {
        kind: 'prose',
        text: 'Follow one request along it. It enters at ingress, where outside traffic arrives; ingress has no capacity limit here. It waits its turn at the app server, and your code runs. Your code asks the database for what it needs — the inspector shows how many queries each request makes — and each query waits its turn and runs there too. Then the answer travels back.',
      },
      {
        kind: 'formula',
        formula: 'database load = requests the app server serves × queries per request',
        explanation:
          'A page that makes five queries puts five times its traffic on the database. A request the app server turns away makes no queries at all.',
      },
      {
        kind: 'prose',
        text: 'Every hop adds its own wait, and this game adds them up: the p99 it reports for a request — the time 99 requests in 100 beat — is the sum of each hop’s p99 along the path. Every hop is also a place to fail. When a component receives more than its capacity, the excess is dropped right there, and nothing behind it ever sees those requests.',
      },
      {
        kind: 'callout',
        tone: 'note',
        text: 'Real requests take steps this game leaves out. Before the first byte arrives, the client looks up your server’s address (DNS) and opens a connection (TCP, plus TLS for HTTPS), and each costs round trips. Distance costs too: light in optical fiber covers about 200,000 km a second, so every 100 km between user and server adds roughly a millisecond to each round trip, and usually more, since cables don’t run straight. This game starts the clock at your ingress.',
      },
      {
        kind: 'prose',
        text: 'Knowing the path tells you where to look. When the weekly report says p99 doubled, the useful question is never whether the system is slow but which hop got slower, and the canvas shows each one’s load.',
      },
    ],
    deeper: {
      summary: 'Rough times for the steps a real request takes, from reading memory to crossing an ocean.',
      blocks: [
        {
          kind: 'prose',
          text: 'Some reference points, from widely circulated tables of latency numbers. They are approximate and date from around 2009, so read them for their ratios, which have aged better than their digits.',
        },
        {
          kind: 'prose',
          text: 'Reading main memory takes about 100 nanoseconds. A round trip between two machines in the same datacenter takes about half a millisecond, five thousand times longer. A seek on a spinning disk takes about 10 milliseconds. A packet sent from California to the Netherlands and back takes about 150 milliseconds.',
        },
        {
          kind: 'prose',
          text: 'The gaps are the lesson. A request that crosses the network for something it could have read from memory pays thousands of times more for the same answer, and a user on another continent has waited longer before your code starts than most of your code will ever take. That is why real systems keep data close to the code that reads it, and servers close to the people who use them.',
        },
      ],
    },
    keyNumbers: [
      {
        label: 'Load a request puts on the database',
        value: 'requests served × queries per request',
        note: 'An app server that serves 200/s and makes three queries for each sends the database 600/s.',
        tag: 'fanout',
      },
      {
        label: 'Load a turned-away request puts downstream',
        value: 'none',
        note: 'A request dropped at the app server never makes its queries, so the database never sees it.',
        tag: 'drops-downstream',
      },
      {
        label: 'The p99 this game reports for a path',
        value: 'the sum of every hop’s p99',
        note: 'Every hop you add costs something. Real tails don’t add up this neatly, so the game’s figure errs on the slow side.',
        tag: 'hop-latency',
      },
      {
        label: 'The hour each hop’s load is worked out at',
        value: 'the busiest: mean × peak multiplier',
        note: 'A service averaging 100/s with a busy hour 2.5 times that puts 250/s on the path when it counts.',
        tag: 'peak-load',
      },
    ],
    misconceptions: [
      {
        claim: 'A request the app server turns away still costs the database a query.',
        correction:
          'A dropped request stops where it was dropped. The database only sees queries from requests the app server actually served, which is why an overloaded app server can make a database look quiet.',
        tag: 'drops-downstream',
      },
      {
        claim: 'If the page is slow, the app server is slow.',
        correction:
          'A request’s time is spread over every hop it crosses, and this game adds them up. A quick app server in front of a saturated database still gives a slow page; look for the hop whose response time grew.',
        tag: 'hop-latency',
      },
    ],
  },
  check: { drawCount: 5 },
  reviewStatus: 'needs-review',
  sources: [
    'docs/02-SIMULATION.md §4 and §5.1–5.2 — the linear request path, queries per request (fanoutFactor), drops that never reach the next hop, and the summed per-hop percentiles (ADR-0009).',
    'docs/02-SIMULATION.md §10 — DNS, connection setup and TLS are deliberately not modeled.',
    'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems” (LADIS 2009), and Peter Norvig, “Teach Yourself Programming in Ten Years” — the reference table: main memory ~100 ns, same-datacenter round trip ~0.5 ms, disk seek ~10 ms, California–Netherlands–California ~150 ms.',
    'Light in optical fiber travels at about c ÷ 1.47 ≈ 204,000 km/s, so 100 km of straight-line separation costs 200 km ÷ 204,000 km/s ≈ 0.98 ms per round trip, before any detour the cable takes.',
  ],
} as const satisfies Concept
