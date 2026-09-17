import type { Question } from '../../schema'

// Authored questions for `vertical-scaling` (09-QUESTION-BANK §2.2): M7b's first batch of 12,
// written in one session, every one `needs-review` until a human reads it.
//
// These cover what the derived templates can't: which upgrade is worth making, what one
// reveals downstream, and what a size can never buy. Every figure is arithmetic on
// 02-SIMULATION §5.2 or read from the component definitions, and each is recomputed in
// `src/state/content-accuracy.test.ts`, so a rebalanced size fails a test rather than
// leaving a question wrong.
//
// Depth mix, by §6's rubric: 3 at depth 1, 6 at depth 2 (two numeric), 3 at depth 3. Staff,
// which draws depths 2 and 3 only, has 9 authored questions here and the derived bank besides.

const provenance = {
  origin: 'authored',
  generatedAt: '2026-09-17',
  generator: 'claude-code/opus-5',
  batchId: 'b-0003-vertical-scaling',
} as const

export const verticalScalingAuthored = [
  {
    id: 'q-vertical-scaling-a-0001',
    conceptId: 'vertical-scaling',
    depth: 1,
    prompt:
      'However large a size you buy, a component’s p99 in this game never falls below a certain floor. What sets that floor?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'The component’s service time' },
        {
          id: 'b',
          text: 'The capacity of the largest size on the menu',
          whyWrong:
            'Capacity decides how much room there is, not how long one request takes. With room to spare, p99 rests on the service time.',
        },
        {
          id: 'c',
          text: 'The utilization target you chose to size for',
          whyWrong:
            'The target decides how far up the curve you run. Even at 0% utilization, a request still takes its service time.',
        },
        {
          id: 'd',
          text: 'Nothing: with enough capacity, p99 heads towards zero',
          whyWrong:
            'More capacity only removes waiting. The work itself still takes its service time, so p99 can’t fall below about 4.6 of them.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'With nothing queued, the mean response time is the service time itself, and p99 is the mean × ln 100 ≈ 4.6. More capacity removes waiting; it can’t shorten the work. Only a component with a shorter service time moves the floor.',
    tags: ['latency-floor'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0002',
    conceptId: 'vertical-scaling',
    depth: 1,
    prompt:
      'Going from the smallest app server in this game to the largest multiplies its capacity by fifty. What happens to the time it takes to serve one request?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'It falls slightly, from 12 ms to 10 ms' },
        {
          id: 'b',
          text: 'It falls by the same factor, to about a fiftieth',
          whyWrong:
            'A bigger size adds room to work on more requests at once, not speed per request. Service time barely moves between sizes.',
        },
        {
          id: 'c',
          text: 'It rises, because the larger machine takes on more requests at once',
          whyWrong:
            'Taking on more requests at once is what capacity measures, and it doesn’t slow each one here. Service time falls slightly, from 12 ms to 10 ms.',
        },
        {
          id: 'd',
          text: 'It falls in step with utilization, since the larger size is less busy',
          whyWrong:
            'Utilization changes how long a request waits, not how long the work takes. The wait shrinks; the service time only goes from 12 ms to 10 ms.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'A size up buys capacity: 10/s to 500/s across the app server’s four sizes. Service time only falls from 12 ms to 10 ms, so an upgrade helps latency by lowering utilization, not by making each request’s work faster.',
    tags: ['upgrade-gain'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0003',
    conceptId: 'vertical-scaling',
    depth: 1,
    prompt:
      'Your app server is past its capacity at peak, and the database behind it looks healthy. What happens downstream when you upgrade the app server?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Requests it was dropping reach the database, which may overload' },
        {
          id: 'b',
          text: 'The database stays healthy, since its load doesn’t depend on the app server',
          whyWrong:
            'The database only sees what the app server serves. Once the app server serves more, the database receives more.',
        },
        {
          id: 'c',
          text: 'The database gets less load, because a bigger app server needs fewer queries',
          whyWrong:
            'Queries per request come from your code, not from the app server’s size. More requests served means more queries, not fewer.',
        },
        {
          id: 'd',
          text: 'Nothing changes downstream until the database is upgraded too',
          whyWrong:
            'The database’s load changes the same week: every request the app server stops dropping arrives there.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Drops happen where the overload is, and a dropped request never reaches the next component. While the app server was dropping, the database only saw what got through. Upgrade the app server and the full peak arrives downstream.',
    tags: ['bottleneck-moves'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0004',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'Your SLO is p99 under 40 ms. Your app server has a 10 ms service time and runs at 20% at peak, for a p99 of about 58 ms. What does moving it to a size with four times the capacity do?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Lowers p99 to about 48 ms, which still misses 40 ms' },
        {
          id: 'b',
          text: 'Cuts p99 to about 14 ms, a quarter of what it was',
          whyWrong:
            'This scales p99 with capacity. It follows 1 ÷ (1 − utilization) instead, and at 20% the component is already near the bottom of that curve.',
        },
        {
          id: 'c',
          text: 'Meets the target, since p99 keeps falling as capacity is added',
          whyWrong:
            'p99 can’t fall below about 4.6 service times, which is 46 ms here. No size of this component meets a 40 ms target.',
        },
        {
          id: 'd',
          text: 'Changes nothing, because the component is under 75% and so not under pressure',
          whyWrong:
            'Being under the pressure band doesn’t make the curve flat. Utilization falls from 20% to 5%, and p99 by about 9 ms; it just can’t reach 40.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Four times the capacity takes utilization from 20% to 5%, and the mean from 12.5 ms to about 10.5 ms, so p99 falls from about 58 ms to about 48 ms. The floor is 4.6 × 10 ≈ 46 ms, so no size gets to 40.',
    tags: ['latency-floor', 'slo'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0005',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'Your database is already the largest size, serving 600/s. Your app server keeps up with a peak of 450 requests a second, each making two database queries. How many queries per second does the database drop?',
    kind: { type: 'numeric', answer: 300, tolerance: 0, unit: '/s' },
    explanation:
      'Two queries for each of 450 requests puts 900/s on the database, against 600/s of capacity, so 300/s are dropped. There is no bigger database to buy; past this point the load has to shrink or be spread over more than one database.',
    tags: ['size-ceiling', 'fanout'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0006',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'Peak is 180/s. Your app server can serve 150/s, and your database can serve 200/s, one query per request. You upgrade the app server to 500/s. What does next week’s report show for the database?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Saturated at 90%, though it drops nothing yet' },
        {
          id: 'b',
          text: 'Under pressure at 75%, exactly as it was before the upgrade',
          whyWrong:
            '75% is what it saw while the app server dropped 30/s. Those requests now arrive too, so it receives 180 ÷ 200 = 90%.',
        },
        {
          id: 'c',
          text: 'Over capacity, dropping the 30/s the app server used to drop',
          whyWrong:
            'The 30/s do arrive, but 180/s is still under the database’s 200/s. It is saturated at 90% and drops nothing.',
        },
        {
          id: 'd',
          text: 'Healthier than before, because the faster app server smooths its traffic',
          whyWrong:
            'Nothing in this model smooths traffic between hops. The database receives whatever the app server serves, which is now the full 180/s.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Before the upgrade the app server served 150/s and dropped 30/s, so the database ran at 150 ÷ 200 = 75%. Afterwards all 180/s get through: 90%, saturated, with its mean response time at ten service times.',
    tags: ['bottleneck-moves', 'utilization'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0007',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'At peak your app server (10 ms service time) runs at 30% and your database (6 ms) at 90%, and the path’s p99 is about 340 ms against a 300 ms target. Doubling which one’s capacity gets p99 under target?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'The database’s, which takes p99 to about 116 ms' },
        {
          id: 'b',
          text: 'The app server’s, since it has the longer service time of the two',
          whyWrong:
            'At 30% the app server is low on the curve, so doubling it saves about 12 ms and leaves p99 near 330. The time is going at the database.',
        },
        {
          id: 'c',
          text: 'Either one, since doubling removes the same share of queueing anywhere',
          whyWrong:
            'What doubling buys depends on where a component starts. From 90% it takes the mean from 10 service times to 1.8; from 30%, from 1.43 to 1.18.',
        },
        {
          id: 'd',
          text: 'Neither on its own: the target needs both doubled together',
          whyWrong: 'Doubling the database alone brings p99 to about 116 ms, well under 300.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'The busier a component, the more capacity buys. The database at 90% has a p99 of about 276 ms, and doubled it runs at 45% with a p99 near 50. The app server at 30% contributes about 66 ms, and doubling it saves only 12.',
    tags: ['upgrade-gain', 'where-to-upgrade'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0008',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'Your busiest hour carries 2.5 times your weekly average, and you size the app server so that the peak sits at 75%. At the average load, what percentage of the capacity you pay for is in use?',
    kind: { type: 'numeric', answer: 30, tolerance: 0.5, unit: '%' },
    explanation:
      'Capacity is sized for the peak, at peak ÷ 0.75. The average is the peak ÷ 2.5, so it uses 0.75 ÷ 2.5 = 30% of that capacity. You pay for all of it every hour, and a typical hour uses under a third.',
    tags: ['idle-capacity', 'cost-tradeoff'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0009',
    conceptId: 'vertical-scaling',
    depth: 2,
    prompt:
      'Your app server is Medium — 40/s of capacity, 11 ms service time — and runs at 90% at peak. You move it to Large: 150/s, 10 ms. What is its mean response time at the same peak, in milliseconds?',
    kind: { type: 'numeric', answer: 13, tolerance: 0.5, unit: 'ms' },
    explanation:
      'Peak is 90% of 40 = 36/s. On Large that is 36 ÷ 150 = 24%, so the mean is 10 ÷ 0.76 ≈ 13 ms, down from 11 ÷ 0.1 = 110 ms. The quicker service time accounts for only about a millisecond of that; the rest is utilization.',
    tags: ['upgrade-gain', 'sizes'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0010',
    conceptId: 'vertical-scaling',
    depth: 3,
    prompt:
      'Your database is Large — 200/s, 5 ms service time — and runs at 40% at peak. You’re considering moving it to Extra large: 600/s, 5 ms. Select every statement that is true of that move.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'Its p99 falls by only about 12 ms' },
        { id: 'b', text: 'Its running cost more than doubles, from $200 to $450 a week' },
        { id: 'c', text: 'It leaves room for more than seven times this peak' },
        {
          id: 'd',
          text: 'Its service time falls by two-thirds, because the new size has three times the capacity',
          whyWrong: 'Both sizes serve a request in 5 ms. Three times the capacity is room, not speed.',
        },
        {
          id: 'e',
          text: 'Its p99 drops to its floor of about 5 ms, the service time, since nothing will be queued',
          whyWrong:
            'The floor is about 4.6 × 5 ≈ 23 ms, not the service time, and at 13% utilization p99 is still a little above it.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'At 40% the database’s mean is 8.3 ms; on Extra large it is 5.8 ms, so p99 falls from about 38 to 27 ms. That, and room for 7.5 times the load, costs $250 more a week and a $4,500 setup. Whether it is worth it now is a judgment call.',
    tags: ['upgrade-gain', 'cost-tradeoff'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0011',
    conceptId: 'vertical-scaling',
    depth: 3,
    prompt:
      'Your app server runs at 60% at peak and keeps up. You move it up a size a week earlier than you strictly need to. Select every statement that is true of upgrading early.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'A week that grows faster than forecast is less likely to drop requests' },
        { id: 'b', text: 'You pay the higher weekly cost for a week that might not have needed it' },
        { id: 'c', text: 'This week’s p99 improves only modestly, since 60% is low on the curve' },
        {
          id: 'd',
          text: 'The database receives more load straight away, because the app server now serves more requests',
          whyWrong:
            'Only if the old size was dropping. At 60% it served everything, so the database sees the same load whatever the app server’s size.',
        },
        {
          id: 'e',
          text: 'Each request’s work gets noticeably faster, which is where most of the gain comes from',
          whyWrong:
            'Service time barely changes between sizes. What falls is the waiting, and at 60% there wasn’t much of it.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'Early headroom is insurance: it costs a week of the larger size’s running cost and buys protection against a week that outruns its forecast. At 60% the mean is 2.5 service times, so there is little latency left to win, and nothing was being dropped for the database to inherit.',
    tags: ['cost-tradeoff', 'bottleneck-moves'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-vertical-scaling-a-0012',
    conceptId: 'vertical-scaling',
    depth: 3,
    prompt:
      'Your p99 target is tight, and your app server already runs at low utilization, with p99 close to its floor. Select every statement that is true about buying it another size up.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'It costs more every week and barely moves p99' },
        { id: 'b', text: 'Only a shorter service time would lower the floor itself' },
        { id: 'c', text: 'The extra room still guards against weeks that outgrow the forecast' },
        {
          id: 'd',
          text: 'Doubling the capacity again would roughly halve p99, as the first doubling did from high on the curve',
          whyWrong:
            'Near the floor the mean is already close to the service time, so doubling capacity takes almost nothing off p99.',
        },
        {
          id: 'e',
          text: 'Removing a hop from the path can’t help, since only the slowest hop’s p99 is reported',
          whyWrong:
            'This game adds every hop’s p99 along the path, so each hop you remove takes its own share off the total.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'Near the floor, capacity buys almost no latency: p99 can’t fall below about 4.6 service times. It still buys room for growth, at a weekly price. To get under a tight target from here you need a shorter service time or fewer hops, not a bigger box.',
    tags: ['latency-floor', 'cost-tradeoff'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
] as const satisfies readonly Question[]
