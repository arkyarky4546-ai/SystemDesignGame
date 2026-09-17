import { defineTemplate, type QuestionTemplate } from '../../schema'
import { ms } from '../template-helpers'

// Derived-question templates for `percentiles` (09-QUESTION-BANK §2.1): p99 from the mean, the
// median from p99, and the mean a p99 target leaves room for. Every multiplier comes from the
// engine's own percentile functions, so a question and the game's dashboard can't disagree.
//
// None of these needs the latency curve from `capacity-and-utilization`, which isn't this
// concept's prerequisite: each starts from a mean or a percentile rather than a utilization.

export const percentilesTemplates: readonly QuestionTemplate[] = [
  defineTemplate({
    id: 'tpl-percentiles-p99-from-mean',
    conceptId: 'percentiles',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 1,
    params: [
      {
        kind: 'choice',
        name: 'meanMs',
        values: [8, 10, 12, 15, 20, 24, 25, 30, 32, 35, 40, 45, 50, 60, 64, 75, 80, 90, 100, 120, 150, 200],
      },
    ],
    build: (params, engine) => ({
      prompt: `A component’s mean response time is ${ms(params.meanMs)}. In this game’s model, what is its p99, the time 99 requests in 100 beat, to the nearest millisecond?`,
      answer: engine.p99LatencyMs(params.meanMs),
      format: ms,
      explanation: `Response times here are spread exponentially around the mean, so p99 = mean × ln 100 ≈ 4.61 × ${params.meanMs} ≈ ${ms(engine.p99LatencyMs(params.meanMs))}. The slowest request in a hundred waits more than four times the average, which the mean alone never shows.`,
      tags: ['p99-vs-mean'],
    }),
    instanceCount: 15,
    distractors: [
      {
        label: 'stopped at the mean',
        compute: (params) => params.meanMs,
        whyWrong: 'This is the mean itself. Response times are spread around it, and the 99th percentile sits about 4.6 times higher.',
      },
      {
        label: 'used the median’s multiplier',
        compute: (params, _correct, engine) => engine.p50LatencyMs(params.meanMs),
        whyWrong:
          'This is the median, about 0.69 of the mean. Half of all requests beat it, so it says nothing about the slow tail p99 measures.',
      },
      {
        label: 'guessed the tail is twice the mean',
        compute: (params) => params.meanMs * 2,
        whyWrong:
          'Doubling the mean underestimates the tail. With response times spread exponentially, p99 is ln 100 ≈ 4.6 times the mean, not 2.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-percentiles-median-from-p99',
    conceptId: 'percentiles',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [{ kind: 'int', name: 'p99Ms', min: 60, max: 900, step: 20 }],
    build: (params, engine) => {
      const mean = params.p99Ms / engine.p99LatencyMs(1)
      return {
        prompt: `Your dashboard shows a p99 of ${ms(params.p99Ms)} for one component. In this game’s model, what is its median response time, to the nearest millisecond?`,
        answer: engine.p50LatencyMs(mean),
        format: ms,
        explanation: `Both percentiles are fixed multiples of the mean: p99 is 4.61 of it and p50 is 0.69. So the mean is ${params.p99Ms} ÷ 4.61 ≈ ${ms(mean)}, and the median is that × 0.69 ≈ ${ms(engine.p50LatencyMs(mean))}, about p99 ÷ 6.6. A typical request is far faster than the slow one the SLO watches.`,
        tags: ['p99-vs-p50', 'median-vs-mean'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'stopped at the mean',
        compute: (params, _correct, engine) => params.p99Ms / engine.p99LatencyMs(1),
        whyWrong: 'This is the mean, which sits above the median. The median is 0.69 of the mean, so it is lower still.',
      },
      {
        label: 'halved p99',
        compute: (params) => params.p99Ms / 2,
        whyWrong:
          'Halving p99 assumes the tail sits twice as far out as the typical request. In this model p99 is about 6.6 times the median.',
      },
      {
        label: 'applied the median multiplier to p99',
        compute: (params, _correct, engine) => engine.p50LatencyMs(params.p99Ms),
        whyWrong:
          'This multiplies p99 by 0.69, but that multiplier turns the mean into the median. p99 has to be turned back into the mean first.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-percentiles-mean-budget',
    conceptId: 'percentiles',
    reviewStatus: 'needs-review',
    status: 'active',
    depth: 2,
    params: [{ kind: 'int', name: 'sloMs', min: 100, max: 2000, step: 50 }],
    build: (params, engine) => {
      const budget = params.sloMs / engine.p99LatencyMs(1)
      return {
        prompt: `Your SLO says p99 must stay at or under ${ms(params.sloMs)}. In this game’s model, what is the highest mean response time a component can have and still meet it, to the nearest millisecond?`,
        answer: budget,
        format: ms,
        explanation: `p99 is the mean × ln 100 ≈ 4.61 × the mean, so the mean has to stay at or under ${params.sloMs} ÷ 4.61 ≈ ${ms(budget)}. A mean that looks comfortably inside the target can still put the slowest requests far outside it.`,
        tags: ['p99-slo', 'p99-vs-mean'],
      }
    },
    instanceCount: 15,
    distractors: [
      {
        label: 'held the mean to the target',
        compute: (params) => params.sloMs,
        whyWrong:
          'This lets the mean reach the target itself. p99 sits about 4.6 times above the mean, so by then the slowest requests are far past the SLO.',
      },
      {
        label: 'held the median to the target',
        compute: (params, _correct, engine) => params.sloMs / engine.p50LatencyMs(1),
        whyWrong:
          'This keeps the median at the target, which lets the mean rise above it. The SLO is on p99, which is 4.6 times the mean, not the median.',
      },
      {
        label: 'multiplied instead of dividing',
        compute: (params, _correct, engine) => engine.p99LatencyMs(params.sloMs),
        whyWrong:
          'This multiplies the target by 4.6. p99 is the larger of the two figures, so the mean has to be smaller than the target, not larger.',
      },
    ],
  }),
]
