import type { ComponentDef } from '../schema'

export const appServer = {
  kind: 'app-server',
  displayName: 'App server',
  placeable: true,
  // Placeholder figures until M7 (ADR-0033): four steps spanning Act 1's 2.5–250 rps peak.
  tiers: [
    { label: 'Small', capacityRps: 10, serviceTimeMs: 12, setupCostCents: 100_00, runningCostPerTurnCents: 20_00 },
    { label: 'Medium', capacityRps: 40, serviceTimeMs: 11, setupCostCents: 400_00, runningCostPerTurnCents: 50_00 },
    { label: 'Large', capacityRps: 150, serviceTimeMs: 10, setupCostCents: 1_200_00, runningCostPerTurnCents: 120_00 },
    { label: 'Extra large', capacityRps: 500, serviceTimeMs: 10, setupCostCents: 3_000_00, runningCostPerTurnCents: 300_00 },
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
