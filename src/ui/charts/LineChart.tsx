import { scaleLinear } from 'd3-scale'

/** One week's value. */
export type ChartPoint = { readonly turn: number; readonly value: number }

export type ChartTarget = { readonly value: number; readonly label: string }

type LineChartProps = {
  readonly points: readonly ChartPoint[]
  /** A one-sentence summary for screen readers. The table view carries every value. */
  readonly label: string
  /** Short axis labels, such as "$12k". */
  readonly formatTick: (value: number) => string
  /** A dashed reference line. Points above it are marked. */
  readonly target?: ChartTarget
}

// SVG user units. At the panel's full width one unit is one CSS pixel, so text stays at the
// type scale's 12px; narrower panels scale the whole chart down.
const WIDTH = 320
const HEIGHT = 120
const MARGIN = { top: 10, right: 12, bottom: 22, left: 64 }
const Y_TICKS = 3
const MARKER = 4

/**
 * A line over weeks (01-ARCHITECTURE §5: hand-written SVG, d3-scale for the arithmetic).
 * The y axis always includes zero, so a line's height means its size, not its wiggle.
 */
export function LineChart({ points, label, formatTick, target }: LineChartProps) {
  const first = points[0]?.turn ?? 0
  const last = points.at(-1)?.turn ?? first
  const x = scaleLinear()
    .domain(first === last ? [first - 1, first] : [first, last])
    .range([MARGIN.left, WIDTH - MARGIN.right])

  const values = [...points.map((point) => point.value), ...(target ? [target.value] : [])]
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  const y = scaleLinear()
    .domain([low, high === low ? low + 1 : high])
    .nice(Y_TICKS)
    .range([HEIGHT - MARGIN.bottom, MARGIN.top])

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.turn)} ${y(point.value)}`).join(' ')
  const latest = points.at(-1)

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full max-w-[20rem]">
      {y.ticks(Y_TICKS).map((tick) => (
        <g key={tick}>
          <line
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={y(tick)}
            y2={y(tick)}
            className={tick === 0 ? 'stroke-ink' : 'stroke-panel-line'}
            strokeWidth={tick === 0 ? 1 : 0.75}
          />
          <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="num fill-ink text-xs">
            {formatTick(tick)}
          </text>
        </g>
      ))}
      {target && (
        <g>
          <line
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={y(target.value)}
            y2={y(target.value)}
            className="stroke-pressure"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={WIDTH - MARGIN.right} y={y(target.value) - 4} textAnchor="end" className="fill-pressure text-xs">
            {target.label}
          </text>
        </g>
      )}
      <path d={path} fill="none" className="stroke-flow" strokeWidth={2} strokeLinejoin="round" />
      {target &&
        points
          .filter((point) => point.value > target.value)
          .map((point) => (
            // ▲ marks a week over target, so it never relies on color alone (01-ARCHITECTURE §9).
            <path
              key={point.turn}
              data-over-target={point.turn}
              d={`M ${x(point.turn)} ${y(point.value) - MARKER} l ${MARKER} ${MARKER * 1.5} h ${-MARKER * 2} z`}
              className="fill-fault"
            />
          ))}
      {latest && <circle cx={x(latest.turn)} cy={y(latest.value)} r={3} className="fill-ink-bright" />}
      <text x={MARGIN.left} y={HEIGHT - 6} className="fill-ink text-xs">
        week {first}
      </text>
      {last !== first && (
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 6} textAnchor="end" className="fill-ink text-xs">
          week {last}
        </text>
      )}
    </svg>
  )
}
