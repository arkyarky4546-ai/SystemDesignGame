import { useEffect, useId, useRef } from 'react'
import { BALANCE } from '../../../config/balance'
import { COMPONENT_DEFS } from '../../../content/components'
import { usersForMeanRps } from '../../../engine'
import type { LastTurn } from '../../../state/store'
import { nodeName } from '../../canvas/copy'
import { ChartPanel } from '../../charts/ChartPanel'
import { Term, TermGroup } from '../../components/Term'
import {
  formatCompact,
  formatCount,
  formatCountChange,
  formatDollarChange,
  formatDollars,
  formatDollarsAndCents,
  formatErrorRate,
  formatMs,
  formatReputation,
  formatRps,
  formatUtilization,
} from '../../format'
import { describeEvent } from './event-copy'
import { describeLoad } from './load-paragraph'

type TurnReportProps = {
  readonly lastTurn: LastTurn
  readonly onClose: () => void
}

const PRIMARY = 'rounded bg-flow px-4 py-2 text-sm font-medium text-panel-void hover:bg-ink-bright'
const MONEY = 'grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm'

const dollarTick = (cents: number) => (cents < 0 ? `−$${formatCompact(-cents / 100)}` : `$${formatCompact(cents / 100)}`)

/**
 * The weekly report (05-UI-DESIGN §5): four charts, the paragraph naming the bottleneck and
 * what wasn't the problem, then money, reputation and every component's figures. A dialog
 * over the canvas; Escape or the button returns to it.
 */
export function TurnReport({ lastTurn, onClose }: TurnReportProps) {
  const { result, before } = lastTurn
  const after = result.nextRun
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => heading.current?.focus(), [])

  const { p99TargetMs, errorRateTarget } = BALANCE.slo
  const history = after.history
  const ran = before.architecture
  const missed = [
    ...(result.service.p99Ms > p99TargetMs ? ['p99 was over target'] : []),
    ...(result.service.errorRate > errorRateTarget ? ['error rate was over target'] : []),
  ]
  const reputationChange =
    after.reputation > before.reputation ? 'rose' : after.reputation < before.reputation ? 'fell' : 'held'
  const path = result.perEdge.map((flow) => flow.to)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-panel-void/85 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded border border-panel-line bg-panel-raised p-4 min-[600px]:p-6"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <h2 id={headingId} ref={heading} tabIndex={-1} className="text-2xl font-semibold text-ink-bright">
          Week {result.turn}
        </h2>

        {result.events.length > 0 && (
          <ul className="flex flex-col gap-2">
            {result.events.map((event, index) => (
              <li key={index} className="border-l-2 border-pressure pl-3 text-sm leading-relaxed text-ink-bright">
                {describeEvent(event)}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 min-[600px]:grid-cols-2">
          <ChartPanel
            title="p99 latency"
            titleTerm="p99"
            value={formatMs(result.service.p99Ms)}
            note={`target ${formatMs(p99TargetMs)}`}
            overTarget={result.service.p99Ms > p99TargetMs}
            points={history.map((turn) => ({ turn: turn.turn, value: turn.p99Ms }))}
            formatValue={formatMs}
            formatTick={(ms) => `${formatCompact(ms)} ms`}
            target={{ value: p99TargetMs, label: `target ${formatMs(p99TargetMs)}` }}
          />
          <ChartPanel
            title="Error rate"
            value={formatErrorRate(result.service.errorRate)}
            note={`target ${formatErrorRate(errorRateTarget)}`}
            overTarget={result.service.errorRate > errorRateTarget}
            points={history.map((turn) => ({ turn: turn.turn, value: turn.errorRate }))}
            formatValue={formatErrorRate}
            formatTick={formatErrorRate}
            target={{ value: errorRateTarget, label: `target ${formatErrorRate(errorRateTarget)}` }}
          />
          <ChartPanel
            title="Cash"
            value={formatDollars(after.cashCents)}
            note={`${formatDollarChange(after.cashCents - before.cashCents)} this week`}
            points={history.map((turn) => ({ turn: turn.turn, value: turn.cashCents }))}
            formatValue={formatDollars}
            formatTick={dollarTick}
          />
          <ChartPanel
            title="Users"
            value={formatCount(result.users)}
            note={`${formatCountChange(result.users - usersForMeanRps(before.workload.meanRps))} this week`}
            points={history.map((turn) => ({ turn: turn.turn, value: turn.users }))}
            formatValue={formatCount}
            formatTick={formatCompact}
          />
        </div>

        <p className="max-w-[68ch] text-base leading-relaxed text-ink-bright">{describeLoad(result, ran)}</p>

        <div className="grid gap-5 min-[600px]:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink-bright">Money this week</h3>
            <dl className={MONEY}>
              <dt>Revenue, at {result.economy.qualityMultiplier.toFixed(2)}× for latency</dt>
              <dd className="num text-right text-ledger">{formatDollarsAndCents(result.economy.revenueCents)}</dd>
              <dt>Running costs</dt>
              <dd className="num text-right">{formatDollarsAndCents(-result.economy.breakdown.runningCents)}</dd>
              <dt>Bandwidth</dt>
              <dd className="num text-right">{formatDollarsAndCents(-result.economy.breakdown.bandwidthCents)}</dd>
              {result.economy.setupCostCents > 0 && (
                <>
                  <dt>Setup</dt>
                  <dd className="num text-right">{formatDollarsAndCents(-result.economy.setupCostCents)}</dd>
                </>
              )}
              <dt className="font-medium text-ink-bright">Net</dt>
              <dd className="num text-right font-medium text-ink-bright">{formatDollarsAndCents(result.economy.netCents)}</dd>
            </dl>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink-bright">Reputation</h3>
            <p className="num text-xl text-ink-bright">
              {formatReputation(before.reputation)} → {formatReputation(after.reputation)}
            </p>
            <p className="text-sm">
              {missed.length === 0
                ? `Both targets were met, so reputation ${reputationChange}.`
                : `${capitalize(missed.join(' and '))}, so reputation ${reputationChange}.`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink-bright">Components at peak</h3>
          <TermGroup>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-xs">
                <thead>
                  <tr className="text-left text-ink-bright">
                    <th scope="col" className="py-1 font-medium">
                      Component
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Size
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Received
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      <Term id="capacity">Capacity</Term>
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      <Term id="utilization">Utilization</Term>
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      <Term id="p99">p99</Term>
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Turned away
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {path.map((nodeId) => {
                    const metrics = result.perNode[nodeId]
                    const node = ran.nodes.find((each) => each.id === nodeId)
                    if (!metrics || !node) return null
                    return (
                      <tr key={nodeId} className="border-t border-panel-line">
                        <th scope="row" className="py-1 text-left font-normal">
                          {nodeName(ran, nodeId)}
                        </th>
                        <td className="py-1">{COMPONENT_DEFS[node.kind].tiers[node.tier]?.label}</td>
                        <td className="num py-1 text-right">{formatRps(metrics.inboundRps)}</td>
                        <td className="num py-1 text-right">{formatRps(metrics.capacityRps)}</td>
                        <td className="num py-1 text-right">
                          {metrics.status === 'saturated' ? '▲ ' : ''}
                          {formatUtilization(metrics.utilization)}
                        </td>
                        <td className="num py-1 text-right">{formatMs(metrics.p99Ms)}</td>
                        <td className="num py-1 text-right">{metrics.droppedRps > 0 ? formatRps(metrics.droppedRps) : '0'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </TermGroup>
        </div>

        <div>
          <button type="button" className={PRIMARY} onClick={onClose}>
            Back to canvas
          </button>
        </div>
      </section>
    </div>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
