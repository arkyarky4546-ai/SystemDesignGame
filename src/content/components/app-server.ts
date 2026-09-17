import type { ComponentDef } from '../schema'

export const appServer = {
  kind: 'app-server',
  displayName: 'App server',
  placeable: true,
  // Four steps spanning Act 1's 2.5–250 rps peak (ADR-0033). Capacity rises fifty-fold while
  // service time barely moves, which is what `vertical-scaling` teaches, and its lesson is
  // tested against these figures. The prices are M9's to tune with the balance harness
  // (ADR-0048). Everything above Small waits on `capacity-and-utilization`: the curriculum
  // gives server tier upgrades to that concept, and databases to `vertical-scaling`
  // (ADR-0040).
  // `failureRatePerTurn` is the chance one instance is down for a week (02-SIMULATION §5.7).
  // A bigger box is a better-run box, so the rate falls as the size rises — but never to
  // zero, which is the whole point of `single-point-of-failure`. M9 tunes the figures; the
  // ordering is the content (ADR-0052).
  tiers: [
    { label: 'Small', capacityRps: 10, serviceTimeMs: 12, setupCostCents: 100_00, runningCostPerTurnCents: 20_00, failureRatePerTurn: 0.02 },
    { label: 'Medium', capacityRps: 40, serviceTimeMs: 11, setupCostCents: 400_00, runningCostPerTurnCents: 50_00, failureRatePerTurn: 0.015, gatedBy: 'capacity-and-utilization' },
    { label: 'Large', capacityRps: 150, serviceTimeMs: 10, setupCostCents: 1_200_00, runningCostPerTurnCents: 120_00, failureRatePerTurn: 0.01, gatedBy: 'capacity-and-utilization' },
    { label: 'Extra large', capacityRps: 500, serviceTimeMs: 10, setupCostCents: 3_000_00, runningCostPerTurnCents: 300_00, failureRatePerTurn: 0.008, gatedBy: 'capacity-and-utilization' },
  ],
  // The second instance is N+1, the fix `single-point-of-failure` names, so that concept
  // opens it; `horizontal-scaling` lifts the cap in Tier 2 (ADR-0050). Neither concept is
  // written yet, so both gates are shut and every app server runs one instance for now.
  replicaGates: [
    { gatedBy: 'single-point-of-failure', opens: { kind: 'up-to', replicas: 2 } },
    { gatedBy: 'horizontal-scaling', opens: { kind: 'uncapped' } },
  ],
  validConnections: {
    upstream: ['ingress', 'app-server'],
    downstream: ['app-server', 'database'],
    refusedDownstream: {
      ingress:
        'Nothing connects into ingress. It’s where traffic arrives from outside, so connect ingress to the app server instead.',
    },
  },
  reviewStatus: 'needs-review',
} as const satisfies ComponentDef
