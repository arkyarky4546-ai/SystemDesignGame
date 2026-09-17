import type { Question } from '../../schema'

// Authored questions for `capacity-and-utilization` (09-QUESTION-BANK §2.2). One batch of
// 15, written in a single session, every one `needs-review` until a human reads it.
//
// Every number here is arithmetic on 02-SIMULATION §5.2, and each one is recomputed against
// the engine in `src/state/content-accuracy.test.ts` so a question and the game can't
// disagree. Depths follow §6's rubric: 1 is recall from the lesson's core, 2 applies a rule
// to numbers the lesson doesn't use, 3 weighs two things the lesson calls good.
//
// Depth mix: 4 at depth 1, 8 at depth 2, 3 at depth 3. That holds every difficulty's
// eligible pool at twice the draw count or more; Staff, which draws depths 2 and 3 only, is
// the binding case at 11 against a draw of 5.

const provenance = {
  origin: 'authored',
  generatedAt: '2026-09-16',
  generator: 'claude-code/opus-5',
  batchId: 'b-0001-capacity-and-utilization',
} as const

export const capacityAndUtilizationAuthored = [
  {
    id: 'q-capacity-and-utilization-a-0001',
    conceptId: 'capacity-and-utilization',
    depth: 1,
    prompt:
      'A component’s mean response time in this game rises as its utilization rises. At 90% utilization, how does a component’s mean response time compare with its own service time?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Ten times the service time' },
        {
          id: 'b',
          text: 'Twice the service time',
          whyWrong: 'Twice is where 50% utilization lands. The multiplier is 1 ÷ (1 − u), so 90% gives ten, not two.',
        },
        {
          id: 'c',
          text: 'Just under twice the service time',
          whyWrong:
            'This assumes response time rises roughly in step with utilization. It rises as 1 ÷ (1 − u): nearly flat at low load, then steep.',
        },
        {
          id: 'd',
          text: 'A hundred times the service time',
          whyWrong: 'A hundred times is 99% utilization. At 90% a tenth of the capacity is still free, so the multiplier is ten.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Mean response time is W = service time ÷ (1 − u). At u = 0.9 the divisor is 0.1, so W is ten times the service time. The same formula gives two at 50% and a hundred at 99%.',
    tags: ['latency-curve'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0002',
    conceptId: 'capacity-and-utilization',
    depth: 1,
    prompt:
      'An app server receives more requests per second than its capacity at peak. In this game’s model, what happens to the requests beyond its capacity?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'They are turned away and never reach the database' },
        {
          id: 'b',
          text: 'They queue at the app server and reach the database later',
          whyWrong:
            'A queue would hold them for later, and nothing in this architecture queues yet. Load above capacity is dropped in the week it arrives.',
        },
        {
          id: 'c',
          text: 'They are served more slowly and still reach the database',
          whyWrong:
            'Everything the app server does serve is slower, but requests beyond capacity are not served at all, so they never reach the database.',
        },
        {
          id: 'd',
          text: 'They are spread across the following weeks',
          whyWrong: 'Each week is resolved on its own traffic. Nothing carries dropped load forward into the next one.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Load above capacity is dropped where it arrives: dropped = received − capacity, and the error rate is that share. A dropped request never reaches the next component, which is how an overloaded app server hides a database that would also have been overloaded.',
    tags: ['drops'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0003',
    conceptId: 'capacity-and-utilization',
    depth: 1,
    prompt:
      'Response times in this game are spread exponentially around the mean rather than clustered on it. Given that, how does a component’s p99 compare with its mean response time?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'About 4.6 times the mean' },
        {
          id: 'b',
          text: 'About one and a half times the mean',
          whyWrong:
            'That is closer to the gap between the mean and the median, in the other direction. The 99th percentile sits much further out, at ln 100 ≈ 4.605 times the mean.',
        },
        {
          id: 'c',
          text: 'About the same as the mean',
          whyWrong:
            'That would hold only if every request took the same time. With an exponential spread the slowest one in a hundred takes far longer than average.',
        },
        {
          id: 'd',
          text: 'About 99 times the mean',
          whyWrong: 'The 99 comes from the percentile’s name, not from the distribution. The multiplier is ln 100 ≈ 4.605.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'For an exponential distribution with mean W, the pth percentile is W × ln(1 ÷ (1 − p)). At p = 0.99 that is W × ln 100 ≈ 4.605 W. At p = 0.5 it is W × ln 2 ≈ 0.693 W, so the median sits below the mean and p99 far above it.',
    tags: ['percentiles'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0004',
    conceptId: 'capacity-and-utilization',
    depth: 1,
    prompt: 'Utilization, as the inspector and the weekly report use the word, is a ratio between which two figures?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Requests received at peak, divided by capacity' },
        {
          id: 'b',
          text: 'Requests received at peak, divided by requests served',
          whyWrong:
            'That ratio describes drops, not load. Utilization measures load against what a component could serve, not against what it did serve.',
        },
        {
          id: 'c',
          text: 'Capacity, divided by requests received at peak',
          whyWrong: 'This is utilization upside down. It would fall as load rose, which is backwards.',
        },
        {
          id: 'd',
          text: 'Mean requests over the week, divided by capacity',
          whyWrong:
            'The game resolves every week at its busiest hour, not its mean. Sizing against the mean leaves a component overloaded exactly when it matters.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Utilization is received ÷ capacity, resolved at the week’s peak and reported up to 99%. It is the input to the latency curve, so it is the one number that says how close a component is to the cliff.',
    tags: ['utilization'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0005',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'Next week’s forecast shows a peak of 2,400/s, and you want no component above 80% utilization at that peak. What capacity, in requests per second, does the app tier need?',
    kind: { type: 'numeric', answer: 3000, tolerance: 0, unit: '/s' },
    explanation:
      'Capacity has to satisfy 2,400 ÷ capacity ≤ 0.80, so capacity ≥ 2,400 ÷ 0.80 = 3,000/s. Dividing by the target is the step. Multiplying by it gives 1,920/s, which is less capacity than the peak itself.',
    tags: ['capacity-math'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0006',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt: 'An app server with a capacity of 400/s receives 340/s at peak. What is its utilization at peak, as a percentage?',
    kind: { type: 'numeric', answer: 85, tolerance: 0.5, unit: '%' },
    explanation:
      'Utilization is received ÷ capacity = 340 ÷ 400 = 0.85, or 85%. That is past the 75% mark where the canvas starts showing pressure, and at 85% the mean response time is already 1 ÷ 0.15 ≈ 6.7 times the service time.',
    tags: ['utilization', 'latency-curve'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0007',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'A database has a service time of 6 ms and is running at 75% utilization at peak. What is its mean response time, in milliseconds?',
    kind: { type: 'numeric', answer: 24, tolerance: 0.5, unit: 'ms' },
    explanation:
      'W = service time ÷ (1 − u) = 6 ÷ 0.25 = 24 ms. Three quarters of the capacity is in use, so a request waits four times its own service time. At 50% the same component would sit at 12 ms.',
    tags: ['latency-curve'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0008',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'An app server has a service time of 12 ms and is running at 80% utilization at peak. What is its p99 at that load, in milliseconds, to the nearest millisecond?',
    kind: { type: 'numeric', answer: 276, tolerance: 2, unit: 'ms' },
    explanation:
      'First the mean: W = 12 ÷ (1 − 0.80) = 60 ms. Then the percentile: p99 = W × ln 100 ≈ 60 × 4.605 = 276 ms. Stopping at the mean understates what the slowest one in a hundred users waits by more than four times.',
    tags: ['percentiles', 'latency-curve'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0009',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt: 'An app server with a capacity of 150/s receives 190/s at peak. How many requests per second does it turn away?',
    kind: { type: 'numeric', answer: 40, tolerance: 0, unit: '/s' },
    explanation:
      'Dropped load is received − capacity = 190 − 150 = 40/s, an error rate of 40 ÷ 190 ≈ 21%. Those 40 never reach the database, so the database’s own figures understate the load it would otherwise have seen.',
    tags: ['drops', 'capacity-math'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0010',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'One component sits at 50% utilization and another at 95%. Both have a 10 ms service time. You can afford to double the capacity of exactly one. Which change removes more milliseconds of mean response time?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'The one at 95%, which falls from 200 ms to about 19 ms' },
        {
          id: 'b',
          text: 'The one at 50%, because it is carrying more traffic',
          whyWrong:
            'Utilization is already load measured against capacity, so nothing here says which carries more traffic. The one under real pressure is at 95%.',
        },
        {
          id: 'c',
          text: 'Both save about the same, since both capacities double',
          whyWrong:
            'The curve is 1 ÷ (1 − u), not a straight line. The same doubling saves about 7 ms at 50% utilization and about 181 ms at 95%.',
        },
        {
          id: 'd',
          text: 'The one at 50%, which falls from 20 ms to 10 ms',
          whyWrong:
            'Doubling capacity halves utilization to 25%, which gives 10 ÷ 0.75 ≈ 13 ms rather than 10 ms. Either way the saving is far smaller than at 95%.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Doubling capacity halves utilization. At 50% that is 20 ms → 13.3 ms, about 7 ms saved. At 95% it is 200 ms → 19 ms, about 181 ms saved. The same money buys wildly different results depending on where on the curve you spend it.',
    tags: ['latency-curve', 'cost-tradeoff'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0011',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'Your service averages 400/s over the week and its busiest hour runs at 2.5 times that. You size the app tier for exactly 400/s of capacity. What does the weekly report show?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Requests turned away, because peak load is 1,000/s' },
        {
          id: 'b',
          text: 'Full utilization and nothing turned away, because the mean fits',
          whyWrong:
            'The week is resolved at its peak hour, not its mean. A tier sized for the mean is 600/s short by the time the busy hour arrives.',
        },
        {
          id: 'c',
          text: 'About 40% utilization, because the mean is well under capacity',
          whyWrong:
            '40% is what the mean alone would give. Every figure in the report comes from the peak, where utilization is capped and the excess is dropped.',
        },
        {
          id: 'd',
          text: 'Higher latency but no drops, since capacity is never exceeded',
          whyWrong: 'Capacity is exceeded at peak — 1,000/s against 400/s. Load above capacity is dropped, not merely slowed.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Peak load is 400 × 2.5 = 1,000/s against 400/s of capacity, so 600/s are turned away: an error rate of 60%. This is why the forecast above the canvas gives next week’s peak rather than its mean.',
    tags: ['peak-vs-mean', 'drops'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0012',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    prompt:
      'An app server makes one database query per request it serves, and at peak it is turning away a third of the traffic arriving at it. What load does the database behind it see?',
    kind: {
      type: 'single',
      options: [
        { id: 'a', text: 'Two thirds of the traffic arriving at the app server' },
        {
          id: 'b',
          text: 'All of the traffic arriving at the app server',
          whyWrong: 'Dropped requests never reach the next hop. The database sees exactly what the app server managed to serve.',
        },
        {
          id: 'c',
          text: 'One third of the traffic arriving at the app server',
          whyWrong:
            'This has the served and dropped shares the wrong way round: a third is turned away, so two thirds are served and passed on.',
        },
        {
          id: 'd',
          text: 'Two thirds now, plus the dropped requests retried later',
          whyWrong: 'Nothing retries in this model. A dropped request is counted in the error rate and is gone.',
        },
      ],
      correctId: 'a',
    },
    explanation:
      'Only served requests move on, and one query per request means the database sees precisely what the app server served — two thirds of the arriving peak. It is also why fixing an overloaded app tier can overload the database the same week: it was never seeing the real load.',
    tags: ['drops', 'capacity-math'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0013',
    conceptId: 'capacity-and-utilization',
    depth: 3,
    prompt:
      'You are deciding whether to size the app tier for 60% utilization at next week’s peak rather than 85%. Select every statement that is true of that choice.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'Mean response time falls from about 6.7× the service time to 2.5×' },
        { id: 'b', text: 'You pay for capacity that is idle in every hour but the peak' },
        { id: 'c', text: 'A week that grows faster than forecast is less likely to drop requests' },
        {
          id: 'd',
          text: 'It removes the risk of dropping requests, whatever next week brings',
          whyWrong: 'Headroom lowers that risk and never removes it. A large enough week still passes any fixed capacity.',
        },
        {
          id: 'e',
          text: 'Latency improves in proportion to the extra capacity bought',
          whyWrong:
            'The curve is 1 ÷ (1 − u), not proportional. 85% → 60% buys a 2.7× improvement for about 1.4× the capacity, while 60% → 35% costs about 1.7× the capacity for only 1.6×.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'Headroom is bought, not free. Moving from 85% to 60% at the same load takes about 1.4 times the capacity, and its running cost, every week. It buys a mean of 2.5 service times instead of 6.7 and room for a week that outruns its forecast. What it does not buy is certainty.',
    tags: ['headroom', 'cost-tradeoff', 'latency-curve'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0014',
    conceptId: 'capacity-and-utilization',
    depth: 3,
    prompt:
      'Your app server is at 96% utilization at peak and cash is tight. Select every statement that is true about leaving it at its current size for one more week.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'Revenue per request falls, because the quality multiplier tracks p99' },
        { id: 'b', text: 'Running costs stay where they are for another week' },
        { id: 'c', text: 'Missing the p99 target costs reputation, which slows next week’s growth' },
        {
          id: 'd',
          text: 'Utilization will read 100%, making the problem obvious in the report',
          whyWrong:
            'Utilization is capped at 99% in this model, so a badly overloaded component and a barely overloaded one can read the same. The turned-away column is what separates them.',
        },
        {
          id: 'e',
          text: 'Latency stays flat until utilization actually reaches capacity',
          whyWrong:
            'Latency climbs the whole way up, and at 96% the mean is already 25 times the service time. The cliff is steep well before the edge.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'Waiting saves the upgrade this week and costs three things: revenue, because the quality multiplier falls once p99 is above target; reputation, when the SLO is missed; and growth, because reputation scales next week’s traffic. Whether that is worth it depends on what a week of cash buys you.',
    tags: ['cost-tradeoff', 'saturation'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
  {
    id: 'q-capacity-and-utilization-a-0015',
    conceptId: 'capacity-and-utilization',
    depth: 3,
    prompt:
      'Next week’s forecast reads about 900/s at peak, likely 700–1,150/s. Select every statement that is true about sizing the app tier for 1,150/s rather than for 900/s.',
    kind: {
      type: 'multi',
      options: [
        { id: 'a', text: 'A week that lands at the top of the range still has headroom' },
        { id: 'b', text: 'You pay the larger size’s running cost even in a week that lands low' },
        { id: 'c', text: 'A real week can still land above the range, so drops stay possible' },
        {
          id: 'd',
          text: 'Sizing above the forecast’s midpoint is the better trade in every run',
          whyWrong:
            'It depends on what a dropped week costs you against what idle capacity costs. Neither end of the range is right in every run or on every difficulty.',
        },
        {
          id: 'e',
          text: 'The larger size lowers p99 more in a quiet week than in a busy one',
          whyWrong:
            'It is the other way round. In a quiet week both sizes sit low on the curve where it is nearly flat; the gap between them only opens up as load rises.',
        },
      ],
      correctIds: ['a', 'b', 'c'],
      partialCredit: true,
    },
    explanation:
      'The forecast’s range is where growth usually lands, not where it must. Sizing for the top costs running money every week and still guarantees nothing; sizing for the middle is cheaper and loses a week now and then. Which is right depends on what a bad week costs you.',
    tags: ['headroom', 'cost-tradeoff', 'peak-vs-mean'],
    status: 'active',
    reviewStatus: 'needs-review',
    provenance,
  },
] as const satisfies readonly Question[]
