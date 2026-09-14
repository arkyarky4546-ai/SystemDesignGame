import type { ComponentDef } from '../schema'

const TERMINAL =
  'A database is where a request’s path ends in this game. It answers queries but sends no requests on, so connect into it instead.'

export const database = {
  kind: 'database',
  displayName: 'Database',
  placeable: true,
  // Placeholder figures until M7 (ADR-0033): a little more capacity than the app server of the
  // same size, so either tier can be the bottleneck.
  tiers: [
    { label: 'Small', capacityRps: 15, serviceTimeMs: 6, setupCostCents: 150_00, runningCostPerTurnCents: 30_00 },
    { label: 'Medium', capacityRps: 50, serviceTimeMs: 6, setupCostCents: 600_00, runningCostPerTurnCents: 80_00 },
    { label: 'Large', capacityRps: 200, serviceTimeMs: 5, setupCostCents: 1_800_00, runningCostPerTurnCents: 200_00 },
    { label: 'Extra large', capacityRps: 600, serviceTimeMs: 5, setupCostCents: 4_500_00, runningCostPerTurnCents: 450_00 },
  ],
  validConnections: {
    upstream: ['app-server'],
    downstream: [],
    refusedDownstream: { ingress: TERMINAL, 'app-server': TERMINAL, database: TERMINAL },
  },
  reviewStatus: 'needs-review',
} as const satisfies ComponentDef
