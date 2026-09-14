import { useId, useState } from 'react'
import { COMPONENT_DEFS } from '../../../content/components'
import type { Architecture, ComponentNode, Edge, NodeId } from '../../../engine'
import {
  connect,
  connectionRefusal,
  disconnect,
  findNode,
  removeNode,
  setFanout,
  setTier,
  type Edit,
} from '../../../state/architecture'
import type { CanvasMessage, CanvasSelection } from '../../canvas/ArchitectureCanvas'
import { describeConnectionRefusal, describeEditRefusal, nodeName, percent } from '../../canvas/copy'

type NodeInspectorProps = {
  readonly architecture: Architecture
  readonly utilization: Readonly<Record<NodeId, number>>
  readonly selection: CanvasSelection
  readonly onChange: (architecture: Architecture, announcement: string) => void
  readonly onSelect: (selection: CanvasSelection) => void
  readonly onMessage: (message: CanvasMessage) => void
  /** Keeps the empty-state heading for screen readers only, where a surrounding sheet already shows it. */
  readonly headingHidden?: boolean
}

const BUTTON = 'rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow disabled:opacity-50'
const FIELD = 'w-full rounded border border-panel-line bg-panel-void px-2 py-1 text-sm text-ink-bright'

/**
 * Settings and connections for the selection. Every canvas edit can also be made here with
 * standard form controls, which is also how editing works below 600px (05-UI-DESIGN §9).
 * M4 adds load, capacity and cost figures.
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
        <p className="text-sm">Select a component to change its size and connections.</p>
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
  const { architecture, node, apply } = props
  const id = useId()
  const def = COMPONENT_DEFS[node.kind]
  const name = nodeName(architecture, node.id)
  const utilization = props.utilization[node.id]
  const outgoing = architecture.edges.filter((edge) => edge.from === node.id)
  const incoming = architecture.edges.filter((edge) => edge.to === node.id)
  const others = architecture.nodes.filter((other) => other.id !== node.id)
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const [fanout, setFanoutText] = useState(node.kind === 'app-server' ? String(node.config.fanoutFactor) : '')

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div>
        <h2 id={`${id}-heading`} className="text-sm font-medium text-ink-bright">
          {name}
        </h2>
        <p className="num mt-1 text-xs">
          {utilization === undefined ? 'No turns run yet' : `Utilization ${percent(utilization)} at peak`}
        </p>
      </div>

      {def.tiers.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          Size
          <select
            className={FIELD}
            value={node.tier}
            onChange={(event) =>
              apply(setTier(architecture, node.id, Number(event.target.value)), `${name} set to ${def.tiers[Number(event.target.value)]?.label ?? 'a new size'}.`)
            }
          >
            {def.tiers.map((tier, index) => (
              <option key={tier.label} value={index}>
                {tier.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {node.kind === 'app-server' && (
        <label className="flex flex-col gap-1 text-xs">
          Database queries per request
          <input
            className={`${FIELD} num`}
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={fanout}
            onChange={(event) => {
              setFanoutText(event.target.value)
              const value = Number(event.target.value)
              if (event.target.value.trim() !== '' && Number.isFinite(value) && value >= 0) {
                apply(setFanout(architecture, node.id, value), `${name} makes ${value} queries per request.`)
              }
            }}
          />
        </label>
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
