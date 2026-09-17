import { BALANCE } from '../../../config/balance'
import type { NodeId, SimEvent } from '../../../engine'
import { formatCount, formatDollars, formatUtilization } from '../../format'

/**
 * What an outage, failure state or act change did to the run, stated plainly
 * (00-GAME-DESIGN §8, 02-SIMULATION §5.7, ADR-0024). Neutral, no apology and no exclamation
 * (05-UI-DESIGN §8). `nameOf` gives a node its player-facing name.
 */
export function describeEvent(event: SimEvent, nameOf: (nodeId: NodeId) => string): string {
  const { failure } = BALANCE
  switch (event.kind) {
    case 'node-failed': {
      const name = nameOf(event.nodeId)
      const weeks = event.turns === 1 ? 'this week' : `this week and the ${event.turns - 1} after it`
      // With one instance the node is simply gone; with peers it keeps serving a share.
      if (event.failedInstances >= event.replicas) {
        return `${name} went down and stayed down ${weeks}. It runs ${formatCount(event.replicas)} ${event.replicas === 1 ? 'instance' : 'instances'}, so there was nothing left to take the traffic: every request that had to cross it failed. Hardware fails; one of everything is zero of something.`
      }
      const surviving = event.replicas - event.failedInstances
      return `${name} lost ${formatCount(event.failedInstances)} of its ${formatCount(event.replicas)} instances ${weeks}. The remaining ${formatCount(surviving)} kept serving, at ${formatUtilization(surviving / event.replicas)} of the capacity you are paying for.`
    }
    case 'node-recovered':
      return `${nameOf(event.nodeId)} was replaced and ran normally again this week.`
    case 'act-started': {
      const users = BALANCE.acts.usersToEnter[event.act - 2]
      const reached = users === undefined ? '' : `You passed ${formatCount(users)} users. `
      return `${reached}Act ${event.act} begins. This week is now where a rollback returns to, and a new bailout is available.`
    }
    case 'bailout':
      return `Cash went below zero, so an investor bailed you out. Cash is now ${formatDollars(event.cashCents)}, reputation fell by ${failure.bailoutReputationPenalty}, and growth runs at ${formatUtilization(failure.bailoutGrowthMultiplier)} of normal for ${failure.bailoutGrowthPenaltyTurns} weeks. If cash runs out again this act, the run rolls back to the start of the act.`
    case 'rollback':
      return event.reason === 'bankruptcy'
        ? `Cash went below zero again after this act’s bailout, so the run rolled back to the start of Act ${event.act}. Cash, reputation, traffic and architecture are as they were then. The week count keeps going.`
        : `Users fell below ${formatUtilization(failure.churnFloorOfActStart)} of what Act ${event.act} started with, so the run rolled back to the start of the act. Cash, reputation, traffic and architecture are as they were then. The week count keeps going.`
  }
}
