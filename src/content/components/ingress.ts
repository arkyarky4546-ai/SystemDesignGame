import type { ComponentDef } from '../schema'

export const ingress = {
  kind: 'ingress',
  displayName: 'Ingress',
  placeable: false,
  tiers: [],
  validConnections: {
    upstream: [],
    downstream: ['app-server'],
    refusedDownstream: {
      ingress: 'Ingress can’t connect to itself. It’s the single point where outside traffic enters.',
      database:
        'Ingress can’t send requests straight to a database. Connect it to an app server, which runs your code and queries the database.',
    },
  },
  reviewStatus: 'needs-review',
} as const satisfies ComponentDef
