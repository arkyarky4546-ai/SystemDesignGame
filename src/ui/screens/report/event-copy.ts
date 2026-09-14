import { BALANCE } from '../../../config/balance'
import type { SimEvent } from '../../../engine'
import { formatCount, formatDollars, formatUtilization } from '../../format'

/**
 * What a failure state or act change did to the run, stated plainly (00-GAME-DESIGN §8,
 * ADR-0024). Neutral, no apology and no exclamation (05-UI-DESIGN §8).
 */
export function describeEvent(event: SimEvent): string {
  const { failure } = BALANCE
  switch (event.kind) {
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
