import type { Concept } from '../../schema'

/**
 * Tier 1 (04-CURRICULUM): after this the player can explain why a system can be fast and
 * still fall over. It unlocks nothing.
 *
 * What it says about the model comes from 02-SIMULATION §5.2 and ADR-0020, and the tier
 * figures it quotes are read from the app server's definition. Both are recomputed in
 * `src/state/content-accuracy.test.ts`, so a rebalanced tier fails a test rather than
 * leaving the lesson wrong. Little's law, in the deeper section, is general queueing theory.
 */
export const latencyAndThroughput = {
  id: 'latency-and-throughput',
  tier: 1,
  title: 'Latency vs throughput',
  oneLiner: 'How fast one request is served and how many can be served are different numbers, and only one says when you fall over.',
  prerequisites: ['client-server-basics'],
  unlocks: { components: [] },
  lesson: {
    core: [
      {
        kind: 'prose',
        text: 'Your app server answers in 12 milliseconds when you try it. On launch day it turns away one request in five. Both are true, because they measure different things. How fast a component serves one request says nothing about how many requests it can serve before it runs out.',
      },
      {
        kind: 'formula',
        formula: 'latency: milliseconds per request · throughput: requests per second',
        explanation:
          'Latency is how long one request takes, waiting included. Throughput is how many requests are completed each second. The units differ because the questions do.',
      },
      {
        kind: 'prose',
        text: 'Throughput has a ceiling. Every component has a capacity — the requests per second it can complete — and this game drops whatever arrives beyond it rather than queueing it forever. A path can’t complete more than its narrowest hop allows: an app server that handles 400/s in front of a database that handles 150/s completes at most 150/s, however quick either one is.',
      },
      {
        kind: 'formula',
        formula: 'error rate = (received − capacity) ÷ received',
        explanation:
          'The share of requests turned away when a component is past its capacity. 200/s arriving at a 150/s component loses 50 of every 200: a quarter, not a third.',
      },
      {
        kind: 'prose',
        text: 'Latency has a floor and a slope. With nothing queued, a request takes the component’s service time — the time the work itself needs. As load rises towards capacity, requests wait behind each other and response time climbs, slowly and then steeply. The next concept is about that curve. What matters here is that it depends on how full the component is, not on how quick it is.',
      },
      {
        kind: 'prose',
        text: 'That is how a system can be fast and still fall over. In this game the smallest app server serves a request in 12 ms and the largest in 10 ms — nearly the same speed — but the largest has fifty times the capacity. A bigger size mostly buys throughput.',
      },
      {
        kind: 'callout',
        tone: 'warning',
        text: 'Throughput is not 1 ÷ latency. A 40 ms response doesn’t cap a server at 25 requests a second, because a server works on many requests at once. Capacity is what caps it, and a stopwatch can’t tell you what that is.',
      },
    ],
    deeper: {
      summary: 'Little’s law: how throughput and response time decide how many requests are inside at once.',
      blocks: [
        {
          kind: 'formula',
          formula: 'requests in flight = throughput × time in the system',
          explanation:
            'Known as Little’s law, it holds for any system that isn’t filling up over time. Convert milliseconds to seconds before multiplying.',
        },
        {
          kind: 'prose',
          text: 'At 200 requests a second and 40 ms each, 200 × 0.04 = 8 requests are inside the component on average. Let each take twice as long at the same throughput and 16 are inside. That is why a slow dependency hurts even when nothing is dropped: requests pile up waiting on it, often holding memory, threads and connections while they wait.',
        },
        {
          kind: 'prose',
          text: 'It also shows why throughput isn’t 1 ÷ latency. Rearranged, throughput = requests in flight ÷ time in the system. One request at a time at 40 ms is 25 a second; eight at a time is 200. How many a component can work on at once is part of its capacity, and no single response time tells you that.',
        },
      ],
    },
    keyNumbers: [
      {
        label: 'Most a path completes per second',
        value: 'its narrowest hop’s capacity',
        note: 'Every request crosses every hop, so the smallest capacity sets the limit and the rest is dropped.',
        tag: 'throughput-ceiling',
      },
      {
        label: 'Share of requests lost past capacity',
        value: '(received − capacity) ÷ received',
        note: '200/s arriving at a 150/s component loses a quarter of them. Dividing by capacity instead gives a third, which is wrong.',
        tag: 'error-share',
      },
      {
        label: 'Throughput worked out from a response time',
        value: 'not possible: it isn’t 1 ÷ latency',
        note: 'A server works on many requests at once. Its capacity, not its speed, caps what it completes.',
        tag: 'throughput-not-inverse',
      },
    ],
    misconceptions: [
      {
        claim: 'A component that responds quickly can take a lot of traffic.',
        correction:
          'Speed and capacity are separate figures. In this game the smallest and largest app servers differ by 2 ms of service time and by fifty times the capacity, and a quick component with little capacity drops everything past it.',
        tag: 'throughput-ceiling',
      },
      {
        claim: 'Past its capacity, a component just gets slower.',
        correction:
          'Past capacity a queue grows every second, so waits don’t settle at slower: they grow until requests time out or are refused. This game refuses the excess at once, and (received − capacity) ÷ received of the requests fail.',
        tag: 'error-share',
      },
      {
        claim: 'A server that takes 40 ms per request can serve 25 requests a second.',
        correction:
          'That holds only for a server that works on one request at a time. Real servers work on many at once, so capacity has to be measured under load; it can’t be read off a response time.',
        tag: 'throughput-not-inverse',
      },
    ],
  },
  check: { drawCount: 5 },
  reviewStatus: 'needs-review',
  sources: [
    'docs/02-SIMULATION.md §5.2 — capacity, drops and the error rate (dropped ÷ received), and response time rising with utilization from the service time.',
    'docs/08-DECISIONS.md ADR-0020 — drops at each hop combine along a path, so a path completes no more than its narrowest hop.',
    'src/content/components/app-server.ts — the tier figures the lesson quotes: Small serves 10/s at 12 ms, Extra large 500/s at 10 ms.',
    'John D. C. Little, “A Proof for the Queuing Formula: L = λW”, Operations Research 9(3), 1961.',
  ],
} as const satisfies Concept
