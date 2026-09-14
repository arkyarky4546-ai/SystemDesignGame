import type { ComponentDef } from '../schema'

export const appServer = {
  kind: 'app-server',
  displayName: 'App server',
  placeable: true,
  tiers: [{ label: 'Small' }, { label: 'Medium' }, { label: 'Large' }, { label: 'Extra large' }],
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
