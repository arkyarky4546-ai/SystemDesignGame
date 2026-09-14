import { serviceLevel, type Architecture, type NodeId, type TickResult } from '../../../engine'
import { findLoadFinding } from '../../../state/report'
import { nodeName } from '../../canvas/copy'
import { WARNING_PERCENT, formatMs, formatRps, formatUtilization } from '../../format'

/**
 * The weekly report's plain-language paragraph (05-UI-DESIGN §5, ADR-0035). It names the
 * bottleneck and a node that wasn't the problem, because the most common mistake is fixing
 * the wrong thing. Every sentence restates a figure from the tick, so the paragraph can't
 * claim anything the simulation didn't do. `ran` is the architecture that produced the tick.
 */
export function describeLoad(tick: TickResult, ran: Architecture): string {
  const finding = findLoadFinding(tick)
  if (!finding) return 'Nothing carried load this week.'
  const name = (nodeId: NodeId) => nodeName(ran, nodeId)
  const utilizationOf = (nodeId: NodeId) => formatUtilization(tick.perNode[nodeId]?.utilization ?? 0)

  if (finding.kind === 'all-healthy') {
    const headroom = finding.mostHeadroom
      ? `, and ${name(finding.mostHeadroom)} had the most headroom, at ${utilizationOf(finding.mostHeadroom)}`
      : ''
    return `Every component ran below ${WARNING_PERCENT} of its capacity at peak. ${name(finding.busiest)} was the busiest, at ${utilizationOf(finding.busiest)}${headroom}.`
  }

  const bottleneck = finding.bottleneck
  const metrics = tick.perNode[bottleneck]
  if (!metrics) return ''
  const sentences: string[] = []

  if (metrics.droppedRps > 0) {
    sentences.push(
      `${name(bottleneck)} was the bottleneck: it received ${formatRps(metrics.inboundRps)} at peak against a capacity of ${formatRps(metrics.capacityRps)}, and turned away ${formatRps(metrics.droppedRps)}.`,
    )
  } else if (metrics.status === 'saturated') {
    sentences.push(`${name(bottleneck)} was the bottleneck, running at ${utilizationOf(bottleneck)} of its capacity at peak.`)
  } else {
    sentences.push(
      `${name(bottleneck)} was the busiest component, at ${utilizationOf(bottleneck)} of its capacity at peak, above the ${WARNING_PERCENT} warning line.`,
    )
  }

  // End-to-end p99 is the sum of each hop's p99 (ADR-0009), so a hop's p99 is exactly its share.
  const { p99Ms } = serviceLevel(tick)
  if (p99Ms > 0) sentences.push(`It accounted for ${formatMs(metrics.p99Ms)} of the ${formatMs(p99Ms)} p99.`)

  if (metrics.droppedRps > 0 && finding.alsoDropping.length === 0) {
    sentences.push('Every failed request this week was one it turned away.')
  } else if (finding.alsoDropping.length > 0) {
    sentences.push(`${listNames(finding.alsoDropping.map(name))} turned requests away too.`)
  }

  const fine = finding.notTheProblem
  if (!fine) {
    sentences.push(`No component had headroom: every one ran at ${WARNING_PERCENT} or more.`)
  } else if (fine.maskedBy) {
    sentences.push(
      `${name(fine.nodeId)} ran at ${utilizationOf(fine.nodeId)}, but it only saw the requests ${name(fine.maskedBy)} didn’t turn away.`,
    )
  } else {
    sentences.push(`${name(fine.nodeId)} wasn’t the problem: it ran at ${utilizationOf(fine.nodeId)}.`)
  }

  return sentences.join(' ')
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
