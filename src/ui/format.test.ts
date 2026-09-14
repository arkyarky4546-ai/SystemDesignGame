import { describe, expect, it } from 'vitest'
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
} from './format'

describe('player-facing number formats', () => {
  it('writes money in dollars with a true minus sign', () => {
    expect(formatDollars(1_248_000)).toBe('$12,480')
    expect(formatDollars(-18_000)).toBe('−$180')
    expect(formatDollars(-40)).toBe('$0')
    expect(formatDollarsAndCents(8_709)).toBe('$87.09')
    expect(formatDollarsAndCents(-120_000)).toBe('−$1,200.00')
    expect(formatDollarChange(210_000)).toBe('+$2,100')
    expect(formatDollarChange(-18_000)).toBe('−$180')
    expect(formatDollarChange(0)).toBe('$0')
  })

  it('writes counts and traffic compactly to three significant figures', () => {
    expect(formatCompact(10)).toBe('10')
    expect(formatCompact(84_200)).toBe('84.2k')
    expect(formatCompact(1_234_567)).toBe('1.23M')
    expect(formatRps(2.5)).toBe('2.5/s')
    expect(formatRps(142.7)).toBe('143/s')
    expect(formatRps(5_123)).toBe('5.12k/s')
    expect(formatCount(84_200.4)).toBe('84,200')
    expect(formatCountChange(2_100)).toBe('+2,100')
    expect(formatCountChange(-38)).toBe('−38')
    expect(formatCountChange(0.2)).toBe('0')
  })

  it('never shows a utilization at a threshold the node hasn’t reached', () => {
    expect(formatUtilization(0.7499)).toBe('74%')
    expect(formatUtilization(0.75)).toBe('75%')
    expect(formatUtilization(0.1 + 0.2)).toBe('30%')
    expect(formatUtilization(0.995)).toBe('99%')
  })

  it('writes latency, error rates and reputation', () => {
    expect(formatMs(939.6)).toBe('940 ms')
    expect(formatMs(11_135.2)).toBe('11,135 ms')
    expect(formatErrorRate(0)).toBe('0%')
    expect(formatErrorRate(0.0004)).toBe('<0.1%')
    expect(formatErrorRate(0.024)).toBe('2.4%')
    expect(formatReputation(0.7123)).toBe('0.71')
  })
})
