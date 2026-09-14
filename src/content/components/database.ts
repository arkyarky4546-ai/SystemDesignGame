import type { ComponentDef } from '../schema'

const TERMINAL =
  'A database is where a request’s path ends in this game. It answers queries but sends no requests on, so connect into it instead.'

export const database = {
  kind: 'database',
  displayName: 'Database',
  placeable: true,
  tiers: [{ label: 'Small' }, { label: 'Medium' }, { label: 'Large' }, { label: 'Extra large' }],
  validConnections: {
    upstream: ['app-server'],
    downstream: [],
    refusedDownstream: { ingress: TERMINAL, 'app-server': TERMINAL, database: TERMINAL },
  },
  reviewStatus: 'needs-review',
} as const satisfies ComponentDef
