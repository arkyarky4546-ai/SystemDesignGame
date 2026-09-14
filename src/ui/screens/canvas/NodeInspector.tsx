import { useId, useState, type ReactNode } from 'react'
import { COMPONENT_DEFS } from '../../../content/components'
import { setupCostCents, type Architecture, type ComponentNode, type Edge, type PricedCatalog, type TickResult } from '../../../engine'
import { connect, connectionRefusal, disconnect, findNode, removeNode, setTier, type Edit } from '../../../state/architecture'
import type { CanvasMessage, CanvasSelection } from '../../canvas/ArchitectureCanvas'
import { describeConnectionRefusal, describeEditRefusal, nodeName } from '../../canvas/copy'
import { Term, TermGroup } from '../../components/Term'
import { formatDollars, formatMs, formatRps, formatUtilization } from '../../format'
import type { TermId } from '../../glossary'

type NodeInspectorProps = {
  /** What the next Advance will run: the player's plan. */
  readonly architecture: Architecture
  /** What ran last week, which setup costs are charged against. */
  readonly builtArchitecture: Architecture
  /** Last week at peak, or null before the first week. */
  readonly lastTick: TickResult | null
  readonly catalog: PricedCatalog
  readonly selection: CanvasSelection
  readonly onChange: (architecture: Architecture, announcement: string) => void
  readonly onSelect: (selection: CanvasSelection) => void
  readonly onMessage: (message: CanvasMessage) => void
  /** Keeps the empty-state heading for screen readers only, where a surrounding sheet already shows it. */
  readonly headingHidden?: boolean
}

const BUTTON = 'rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow disabled:opacity-50'
const FIELD = 'w-full rounded border border-panel-line bg-panel-void px-2 py-1 text-sm text-ink-bright'
const FIGURES = 'grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs'

/**
 * The selection's figures and settings (05-UI-DESIGN §4). It shows capacity and cost at the
 * chosen size next to what the node received last week, so the player can size against the
 * forecast. It never projects next week's load (ADR-0032). Every canvas edit can also be
 * made here with standard form controls, which is also how editing works below 600px (§9).
 */
export function NodeInspector(props: NodeInspectorProps) {
  const { architecture, selection } = props

  const apply = (edit: Edit, announcement: string, then?: CanvasSelection) => {
    if (!edit.ok) {
      props.onMessage({ tone: 'refusal', text: describeEditRefusal(edit.error, architecture) })
      return
    }
    props.onChange(edit.value, announcement)
    if (then) props.onSelect(then)
  }

  const disconnectEdge = (edge: Edge) => {
    props.onChange(
      disconnect(architecture, edge),
      `Disconnected ${nodeName(architecture, edge.from)} from ${nodeName(architecture, edge.to)}.`,
    )
  }

  if (selection.kind === 'edge') {
    const { from, to } = selection.edge
    return (
      <section aria-labelledby="inspector-heading" className="flex flex-col gap-3">
        <h2 id="inspector-heading" className="text-sm font-medium text-ink-bright">
          Connection
        </h2>
        <p className="text-sm">
          {nodeName(architecture, from)} sends requests to {nodeName(architecture, to)}.
        </p>
        <div>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              disconnectEdge(selection.edge)
              props.onSelect({ kind: 'none' })
            }}
          >
            Remove connection
          </button>
        </div>
      </section>
    )
  }

  const node = selection.kind === 'node' ? findNode(architecture, selection.nodeId) : undefined
  if (!node) {
    return (
      <section aria-labelledby="inspector-heading" className="flex flex-col gap-2">
        <h2 id="inspector-heading" className={props.headingHidden ? 'sr-only' : 'text-sm font-medium text-ink-bright'}>
          Inspector
        </h2>
        <TermGroup>
          <p className="text-sm">Select a component to see its load and change its size and connections.</p>
          <p className="mt-2 text-sm">
            Compare its <Term id="capacity">capacity</Term> with the peak in the forecast above the canvas.
          </p>
        </TermGroup>
      </section>
    )
  }

  return <NodeDetails key={node.id} {...props} node={node} apply={apply} disconnectEdge={disconnectEdge} />
}

function NodeDetails(
  props: NodeInspectorProps & {
    readonly node: ComponentNode
    readonly apply: (edit: Edit, announcement: string, then?: CanvasSelection) => void
    readonly disconnectEdge: (edge: Edge) => void
  },
) {
  const { architecture, node, apply, lastTick } = props
  const id = useId()
  const def = COMPONENT_DEFS[node.kind]
  const name = nodeName(architecture, node.id)
  const outgoing = architecture.edges.filter((edge) => edge.from === node.id)
  const incoming = architecture.edges.filter((edge) => edge.to === node.id)
  const others = architecture.nodes.filter((other) => other.id !== node.id)
  const [target, setTarget] = useState(others[0]?.id ?? '')

  const tiers = node.kind === 'ingress' ? [] : props.catalog[node.kind]
  const tier = tiers[node.tier]
  const setup = node.kind !== 'ingress' && tier ? setupCostCents(props.builtArchitecture, [{ node, tier }]) : 0
  const built = findNode(props.builtArchitecture, node.id)
  const metrics = lastTick?.perNode[node.id]
  const builtSize = built && built.tier !== node.tier ? def.tiers[built.tier]?.label : undefined

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div>
        <h2 id={`${id}-heading`} className="text-sm font-medium text-ink-bright">
          {name}
        </h2>
        {node.kind !== 'ingress' && (
          <p className="mt-1 text-xs">
            {def.tiers[node.tier]?.label ?? 'Unknown size'} × <span className="num">{node.replicas}</span>
          </p>
        )}
      </div>

      {def.tiers.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          Size
          <select
            className={`${FIELD} num`}
            value={node.tier}
            onChange={(event) =>
              apply(
                setTier(architecture, node.id, Number(event.target.value)),
                `${name} set to ${def.tiers[Number(event.target.value)]?.label ?? 'a new size'}.`,
              )
            }
          >
            {def.tiers.map((option, index) => {
              const figures = tiers[index]
              return (
                <option key={option.label} value={index}>
                  {figures
                    ? `${option.label} · ${formatRps(figures.capacityRps)} · ${formatDollars(figures.runningCostPerTurnCents)} a week`
                    : option.label}
                </option>
              )
            })}
          </select>
        </label>
      )}

      {tier && (
        <Figures title="At this size">
          <Figure label="Capacity" term="capacity" value={formatRps(tier.capacityRps)} />
          <Figure label="Service time" value={formatMs(tier.serviceTimeMs)} />
          <Figure label="Running cost" value={`${formatDollars(tier.runningCostPerTurnCents * node.replicas)} a week`} />
          {setup > 0 && <Figure label="Setup when you advance" value={formatDollars(setup)} />}
        </Figures>
      )}

      {node.kind === 'ingress' ? (
        lastTick && (
          <Figures title="Last week">
            <Figure label="Traffic at peak" value={formatRps(lastTick.peakRps)} />
          </Figures>
        )
      ) : (
        <Figures title={builtSize ? `Last week at peak, as ${builtSize}` : 'Last week at peak'}>
          {metrics ? (
            <>
              <Figure label="Received" value={formatRps(metrics.inboundRps)} />
              <Figure label="Capacity" term="capacity" value={formatRps(metrics.capacityRps)} />
              <Figure label="Utilization" term="utilization" value={formatUtilization(metrics.utilization)} />
              <Figure label="p99" term="p99" value={formatMs(metrics.p99Ms)} />
              {metrics.droppedRps > 0 && <Figure label="Turned away" value={formatRps(metrics.droppedRps)} />}
            </>
          ) : (
            <p className="col-span-2">{lastTick ? 'Not running yet. It runs from next week.' : 'No weeks run yet.'}</p>
          )}
        </Figures>
      )}

      {node.kind === 'app-server' && (
        <p className="text-xs">
          Database queries per request <span className="num text-ink-bright">{node.config.fanoutFactor}</span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-ink-bright">Connections</h3>
        {outgoing.length + incoming.length === 0 && <p className="text-xs">Not connected to anything.</p>}
        <ul className="flex flex-col gap-1">
          {incoming.map((edge) => (
            <li key={`in-${edge.from}`} className="flex items-center justify-between gap-2 text-xs">
              Receives from {nodeName(architecture, edge.from)}
              <button type="button" className={BUTTON} onClick={() => props.disconnectEdge(edge)}>
                Disconnect
              </button>
            </li>
          ))}
          {outgoing.map((edge) => (
            <li key={`out-${edge.to}`} className="flex items-center justify-between gap-2 text-xs">
              Sends to {nodeName(architecture, edge.to)}
              <button type="button" className={BUTTON} onClick={() => props.disconnectEdge(edge)}>
                Disconnect
              </button>
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              Send requests to
              <select className={FIELD} value={target} onChange={(event) => setTarget(event.target.value)}>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {nodeName(architecture, other.id)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                const refusal = connectionRefusal(architecture, node.id, target)
                if (refusal) {
                  props.onMessage({ tone: 'refusal', text: describeConnectionRefusal(refusal, architecture, node.id, target) })
                  return
                }
                apply(connect(architecture, node.id, target), `Connected ${name} to ${nodeName(architecture, target)}.`)
              }}
            >
              Connect
            </button>
          </div>
        )}
      </div>

      {def.placeable && (
        <div>
          <button
            type="button"
            className={BUTTON}
            onClick={() => apply(removeNode(architecture, node.id), `Removed ${name}.`, { kind: 'none' })}
          >
            Remove {name}
          </button>
        </div>
      )}
    </section>
  )
}

function Figures({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <h3 id={id} className="text-xs font-medium text-ink-bright">
        {title}
      </h3>
      <TermGroup>
        <dl aria-labelledby={id} className={FIGURES}>
          {children}
        </dl>
      </TermGroup>
    </div>
  )
}

/** One labelled figure. A defined term's label opens its definition below the figures (M4a). */
function Figure({ label, value, term }: { readonly label: string; readonly value: string; readonly term?: TermId }) {
  return (
    <>
      <dt>{term ? <Term id={term}>{label}</Term> : label}</dt>
      <dd className="num text-right text-ink-bright">{value}</dd>
    </>
  )
}
