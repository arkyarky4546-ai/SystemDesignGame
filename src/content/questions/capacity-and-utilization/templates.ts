import { defineTemplate, type QuestionTemplate } from '../../schema'

// Derived-question templates for `capacity-and-utilization` (09-QUESTION-BANK §2.1). These
// are what a human reviews: approving a template approves every instance it produces, because
// the engine computed them.
//
// Every distractor is the arithmetic consequence of one named mistake a learner actually
// makes, so its `whyWrong` is accurate by construction rather than by authoring care.
//
// Parameter steps keep the numbers ones a person would plausibly see — 2,400 rps, not 2,387.

/** Percent of a fraction, for prompts: 0.8 → "80". */
const percent = (fraction: number) => Math.round(fraction * 100)

export const capacityAndUtilizationTemplates: readonly QuestionTemplate[] = [
  defineTemplate({
    id: 'tpl-capacity-instances-needed',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    params: [
      { kind: 'int', name: 'meanRps', min: 200, max: 4000, step: 100 },
      { kind: 'choice', name: 'peakMultiplier', values: [1.5, 2, 2.5, 3] },
      { kind: 'choice', name: 'capacityRps', values: [150, 200, 250, 400, 500] },
      { kind: 'choice', name: 'targetUtilization', values: [0.6, 0.7, 0.75, 0.8] },
    ],
    // Keep the answer in a range a player would actually build, and away from the trivial 1.
    constraints: (params) => {
      const peak = params.meanRps * params.peakMultiplier
      const needed = peak / (params.capacityRps * params.targetUtilization)
      return needed >= 2 && needed <= 40
    },
    build: (params, engine) => ({
      prompt: `Your service averages ${params.meanRps}/s and its busiest hour runs at ${params.peakMultiplier} times that. One app server of the size you are buying serves ${params.capacityRps}/s. How many do you need to stay at or under ${percent(params.targetUtilization)}% utilization at peak?`,
      answer: engine.instancesNeeded(params.meanRps * params.peakMultiplier, params.capacityRps, params.targetUtilization),
      format: (value) => String(value),
      explanation: `Peak load is ${params.meanRps} × ${params.peakMultiplier} = ${params.meanRps * params.peakMultiplier}/s. Capacity has to reach peak ÷ ${params.targetUtilization}, and each server gives ${params.capacityRps}/s, so you divide and round up. Rounding down would leave the fleet over the target on the busiest hour.`,
      tags: ['capacity-math', 'peak-vs-mean'],
    }),
    instanceCount: 16,
    distractors: [
      {
        label: 'forgot headroom',
        compute: (params) => Math.ceil((params.meanRps * params.peakMultiplier) / params.capacityRps),
        whyWrong:
          'This sizes the fleet to exactly meet the peak, which puts every server at 100% utilization. At 100% the latency curve has no finite value and load starts being turned away; the target exists to keep you off it.',
      },
      {
        label: 'inverted the headroom factor',
        compute: (params) =>
          Math.ceil((params.meanRps * params.peakMultiplier * params.targetUtilization) / params.capacityRps),
        whyWrong:
          'This multiplies by the target instead of dividing by it, which asks for less capacity than the peak needs rather than more. Headroom makes the fleet bigger, never smaller.',
      },
      {
        label: 'used mean instead of peak',
        compute: (params) => Math.ceil(params.meanRps / (params.capacityRps * params.targetUtilization)),
        whyWrong:
          'This sizes for the weekly mean. The game resolves every week at its busiest hour, so a fleet sized for the mean is short by the whole peak multiplier exactly when it matters.',
      },
      {
        label: 'rounded down',
        compute: (params) =>
          Math.max(1, Math.floor((params.meanRps * params.peakMultiplier) / (params.capacityRps * params.targetUtilization))),
        whyWrong:
          'This rounds the fleet down. A fraction of a server serves nothing, so any remainder needs a whole extra instance; rounding down leaves the fleet above the target it was sized for.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-capacity-utilization-from-load',
    conceptId: 'capacity-and-utilization',
    depth: 1,
    params: [
      { kind: 'int', name: 'meanRps', min: 40, max: 600, step: 10 },
      { kind: 'choice', name: 'peakMultiplier', values: [1.5, 2, 2.5, 3] },
      { kind: 'choice', name: 'capacityRps', values: [200, 250, 400, 500, 800, 1000] },
    ],
    // A peak that lands on a whole request per second and a utilization worth asking about:
    // not so low the answer is obvious, not so high the component is already dropping load.
    constraints: (params) => {
      const peak = params.meanRps * params.peakMultiplier
      const used = peak / params.capacityRps
      return Number.isInteger(peak) && used >= 0.3 && used <= 0.95
    },
    build: (params, engine) => ({
      prompt: `An app server has a capacity of ${params.capacityRps}/s. Traffic averages ${params.meanRps}/s and its busiest hour runs at ${params.peakMultiplier} times that. What is the server's utilization at peak, as a percentage?`,
      answer: engine.utilization(params.meanRps * params.peakMultiplier, params.capacityRps) * 100,
      format: (value) => `${Math.round(value)}%`,
      explanation: `Peak load is ${params.meanRps} × ${params.peakMultiplier} = ${params.meanRps * params.peakMultiplier}/s, and utilization is received ÷ capacity at peak, so ${params.meanRps * params.peakMultiplier} ÷ ${params.capacityRps}. Every latency and error figure in the game is resolved at that busiest hour rather than at the mean.`,
      tags: ['utilization', 'peak-vs-mean'],
    }),
    instanceCount: 16,
    distractors: [
      {
        label: 'used the mean instead of the peak',
        compute: (params) => (params.meanRps / params.capacityRps) * 100,
        whyWrong:
          'This measures the weekly mean against capacity. The game resolves every week at its busiest hour, so the figure that matters is the peak, which is higher by the whole peak multiplier.',
      },
      {
        label: 'gave the headroom',
        compute: (params) => (1 - (params.meanRps * params.peakMultiplier) / params.capacityRps) * 100,
        whyWrong:
          'This is the share of capacity still free, not the share in use. The two add up to 100%, and it is the used share that drives the latency curve.',
      },
      {
        label: 'split the difference between mean and peak',
        compute: (params) =>
          ((params.meanRps / params.capacityRps + (params.meanRps * params.peakMultiplier) / params.capacityRps) / 2) * 100,
        whyWrong:
          'This averages the utilization at the mean with the utilization at the peak. Nothing in the game runs at that average: the week is resolved at the peak, and a component sized for a blend is short when the busy hour arrives.',
      },
    ],
  }),
  defineTemplate({
    id: 'tpl-capacity-latency-at-utilization',
    conceptId: 'capacity-and-utilization',
    depth: 2,
    params: [
      { kind: 'choice', name: 'serviceTimeMs', values: [4, 5, 6, 8, 10, 12, 15, 20] },
      { kind: 'choice', name: 'utilization', values: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95] },
    ],
    build: (params, engine) => ({
      prompt: `A component has a service time of ${params.serviceTimeMs} ms and is running at ${percent(params.utilization)}% utilization at peak. What is its p99 at that load, to the nearest millisecond?`,
      answer: engine.p99LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, params.utilization)),
      format: (value) => `${Math.round(value)} ms`,
      explanation: `Two steps. The mean is W = ${params.serviceTimeMs} ÷ (1 − ${params.utilization}) = ${Math.round(params.serviceTimeMs / (1 - params.utilization))} ms, and p99 is W × ln 100 ≈ 4.605 W. Stopping at the mean understates what the slowest one in a hundred users waits by more than four times.`,
      tags: ['latency-curve', 'percentiles'],
    }),
    instanceCount: 16,
    distractors: [
      {
        label: 'stopped at the mean',
        compute: (params, _correct, engine) => engine.meanResponseTimeMs(params.serviceTimeMs, params.utilization),
        whyWrong:
          'This is the mean response time, not the 99th percentile. Response times are spread exponentially around the mean, so p99 is about 4.6 times it.',
      },
      {
        label: 'used the median instead of p99',
        compute: (params, _correct, engine) =>
          engine.p50LatencyMs(engine.meanResponseTimeMs(params.serviceTimeMs, params.utilization)),
        whyWrong:
          'This is the median, which is about 0.69 of the mean. Half of all requests beat it, so it says nothing about the tail the SLO is set on.',
      },
      {
        label: 'divided by utilization instead of its complement',
        compute: (params, _correct, engine) => engine.p99LatencyMs(params.serviceTimeMs / params.utilization),
        whyWrong:
          'This divides the service time by u rather than by 1 − u. It gets smaller as the component gets busier, which is the opposite of what queueing does.',
      },
      {
        label: 'read the service time as the latency',
        compute: (params) => params.serviceTimeMs,
        whyWrong:
          'This is the service time on its own: what the component takes with nothing queued in front of the request. Under load a request also waits, and that wait is most of the figure.',
      },
    ],
  }),
]
