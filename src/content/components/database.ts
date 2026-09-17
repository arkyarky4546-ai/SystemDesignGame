import type { ComponentDef } from '../schema'

const TERMINAL =
  'A database is where a request’s path ends in this game. It answers queries but sends no requests on, so connect into it instead.'

export const database = {
  kind: 'database',
  displayName: 'Database',
  placeable: true,
  // A little more capacity than the app server of the same size, so either tier can be the
  // bottleneck (ADR-0033). The prices are M9's to tune with the balance harness (ADR-0048).
  // Everything above Small waits on `vertical-scaling`, which the curriculum gives component
  // size upgrades to once `capacity-and-utilization` has opened the app server's (ADR-0040).
  tiers: [
    { label: 'Small', capacityRps: 15, serviceTimeMs: 6, setupCostCents: 150_00, runningCostPerTurnCents: 30_00 },
    { label: 'Medium', capacityRps: 50, serviceTimeMs: 6, setupCostCents: 600_00, runningCostPerTurnCents: 80_00, gatedBy: 'vertical-scaling' },
    { label: 'Large', capacityRps: 200, serviceTimeMs: 5, setupCostCents: 1_800_00, runningCostPerTurnCents: 200_00, gatedBy: 'vertical-scaling' },
    { label: 'Extra large', capacityRps: 600, serviceTimeMs: 5, setupCostCents: 4_500_00, runningCostPerTurnCents: 450_00, gatedBy: 'vertical-scaling' },
  ],
  validConnections: {
    upstream: ['app-server'],
    downstream: [],
    refusedDownstream: { ingress: TERMINAL, 'app-server': TERMINAL, database: TERMINAL },
  },
  reviewStatus: 'needs-review',
} as const satisfies ComponentDef
