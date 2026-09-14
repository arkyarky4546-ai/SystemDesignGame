import { useId, useState, type ReactNode } from 'react'
import { TermGroup, TermLabel } from '../components/Term'
import type { TermId } from '../glossary'
import { LineChart, type ChartPoint, type ChartTarget } from './LineChart'

type ChartPanelProps = {
  readonly title: string
  /** A defined term the title starts with, such as p99 in "p99 latency". Its words open the definition. */
  readonly titleTerm?: TermId
  /** This week's value, formatted. */
  readonly value: string
  /** One line under the value: the target, or the change since last week. */
  readonly note: ReactNode
  /** Whether this week missed the target. Shown as ▲ as well as in color. */
  readonly overTarget?: boolean
  readonly points: readonly ChartPoint[]
  readonly formatValue: (value: number) => string
  readonly formatTick: (value: number) => string
  readonly target?: ChartTarget
}

const BUTTON = 'rounded border border-panel-line px-2 py-1 text-xs text-ink-bright hover:border-flow'

/**
 * One report chart with its table view (01-ARCHITECTURE §9). The table holds the same values
 * as the chart, one row per week, so nothing is only visible as a shape.
 */
export function ChartPanel(props: ChartPanelProps) {
  const { title, points, formatValue, target } = props
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const headingId = useId()
  const latest = points.at(-1)
  const summary = latest
    ? `${title} over ${points.length === 1 ? 'one week' : `${points.length} weeks`}, ${formatValue(latest.value)} in week ${latest.turn}${target ? `, against ${target.label}` : ''}.`
    : `${title}: no weeks yet.`

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2 rounded border border-panel-line bg-panel-void p-3">
      <div className="flex items-start justify-between gap-2">
        <TermGroup>
          <h3 id={headingId} className="text-sm font-medium text-ink-bright">
            {props.titleTerm ? <TermLabel id={props.titleTerm} text={title} /> : title}
          </h3>
          <p className={`num text-xl ${props.overTarget ? 'text-fault' : 'text-ink-bright'}`}>
            {props.overTarget && <span aria-hidden="true">▲ </span>}
            {props.value}
            {props.overTarget && <span className="sr-only">, over target</span>}
          </p>
          <p className="num text-xs">{props.note}</p>
        </TermGroup>
        {/* The visible words start the accessible name, so voice control can still find the button. */}
        <button
          type="button"
          aria-label={`${view === 'chart' ? 'Show table' : 'Show chart'} for ${title}`}
          className={`${BUTTON} shrink-0`}
          onClick={() => setView((current) => (current === 'chart' ? 'table' : 'chart'))}
        >
          {view === 'chart' ? 'Show table' : 'Show chart'}
        </button>
      </div>
      {view === 'chart' ? (
        <LineChart points={points} label={summary} formatTick={props.formatTick} target={target} />
      ) : (
        <div className="max-h-40 overflow-y-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 text-left font-medium text-ink-bright">
                  Week
                </th>
                <th scope="col" className="py-1 text-right font-medium text-ink-bright">
                  {title}
                </th>
                {target && (
                  <th scope="col" className="py-1 text-right font-medium text-ink-bright">
                    Target
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.turn} className="border-t border-panel-line">
                  <td className="num py-1">{point.turn}</td>
                  <td className="num py-1 text-right">{formatValue(point.value)}</td>
                  {target && <td className="py-1 text-right">{point.value > target.value ? '▲ missed' : 'met'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
