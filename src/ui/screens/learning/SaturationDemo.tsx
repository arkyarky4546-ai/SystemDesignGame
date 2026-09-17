import { useId, useMemo, useState } from 'react'
import { DEMOS } from '../../../content/demos'
import type { Demo, DemoId, MetricId } from '../../../content/schema'
import { simulateTick, type NodeMetrics, type PricedCatalog } from '../../../engine'
import { architectureFor } from '../../../state/diagram'
import { formatErrorRate, formatMs, formatRps, formatUtilization } from '../../format'

type DemoWidgetProps = {
  readonly demoId: DemoId
  /** The same tiers the game's turns resolve against, so the slider can't disagree with a run. */
  readonly catalog: PricedCatalog
}

const METRIC_LABEL: Readonly<Record<MetricId, string>> = {
  utilization: 'Utilization',
  meanMs: 'Mean response time',
  p50Ms: 'p50',
  p99Ms: 'p99',
  errorRate: 'Error rate',
}

/**
 * The saturation demo (03-CONTENT-SCHEMA §7): one slider, one architecture, figures that
 * update live from the real engine. Drag load towards capacity and watch p99 go vertical —
 * §7 calls it worth more than any three paragraphs, and it is the first demo built.
 *
 * Every figure comes from `simulateTick`, so what the slider shows is what a week at that
 * load would actually do.
 */
export function DemoWidget({ demoId, catalog }: DemoWidgetProps) {
  const demo: Demo = DEMOS[demoId]
  const id = useId()
  const [value, setValue] = useState(Math.round((demo.variable.min + demo.variable.max) / 2))

  const architecture = useMemo(() => architectureFor(demo.architecture), [demo])
  const metrics = useMemo((): NodeMetrics | null => {
    const tick = simulateTick({
      turn: 0,
      architecture,
      // The slider is the load, so the peak multiplier is 1: one number moves at a time.
      workload: { meanRps: value, peakMultiplier: 1, readFraction: 0.8, staticFraction: 0.3, keySkew: 0.2, payloadKb: 50 },
      catalog,
    })
    return tick.ok ? (tick.value.perNode[demo.nodeId] ?? null) : null
  }, [architecture, value, catalog, demo.nodeId])

  return (
    <figure className="flex flex-col gap-3 rounded border border-panel-line bg-panel-raised px-4 py-3">
      <label htmlFor={id} className="flex items-baseline justify-between gap-4 text-sm">
        <span>{demo.variable.label}</span>
        <span className="num text-ink-bright">{formatRps(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        className="w-full accent-flow"
        min={demo.variable.min}
        max={demo.variable.max}
        step={demo.variable.step}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
      />

      <dl aria-live="polite" className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {demo.showMetrics.map((metric) => (
          <div key={metric} className="contents">
            <dt>{METRIC_LABEL[metric]}</dt>
            <dd className="num text-right text-ink-bright">{metrics ? formatMetric(metric, metrics) : '—'}</dd>
          </div>
        ))}
      </dl>

      <figcaption className="text-sm leading-relaxed">{demo.caption}</figcaption>
    </figure>
  )
}

function formatMetric(metric: MetricId, metrics: NodeMetrics): string {
  switch (metric) {
    case 'utilization':
      return formatUtilization(metrics.utilization)
    case 'meanMs':
      return formatMs(metrics.meanMs)
    case 'p50Ms':
      return formatMs(metrics.p50Ms)
    case 'p99Ms':
      return formatMs(metrics.p99Ms)
    case 'errorRate':
      return formatErrorRate(metrics.inboundRps > 0 ? metrics.droppedRps / metrics.inboundRps : 0)
  }
}
