import { COMPONENT_DEFS } from '../content/components'
import type { ComponentTier } from '../content/schema'
import type { PricedCatalog, TierDef } from '../engine'

// The engine takes tier figures as input (ADR-0020), so its tests price turns without
// content. The game prices them from the component definitions (ADR-0033).

const tierDef = ({
  capacityRps,
  serviceTimeMs,
  setupCostCents,
  runningCostPerTurnCents,
  failureRatePerTurn,
}: ComponentTier): TierDef => ({
  capacityRps,
  serviceTimeMs,
  setupCostCents,
  runningCostPerTurnCents,
  failureRatePerTurn,
})

/** Each resource kind's tiers, from its component definition: what the game's turns resolve against. */
export const CONTENT_CATALOG: PricedCatalog = {
  'app-server': COMPONENT_DEFS['app-server'].tiers.map(tierDef),
  database: COMPONENT_DEFS.database.tiers.map(tierDef),
}
