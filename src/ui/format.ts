import { BALANCE } from '../config/balance'

// Every figure the player reads goes through here, in one locale, so a number reads the same
// in every browser and in tests. Figures render in the mono face with tabular digits
// (05-UI-DESIGN §2). Negative amounts use a true minus sign.

const LOCALE = 'en-US'
const MINUS = '−'

const wholeNumber = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const twoDecimals = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compactNumber = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumSignificantDigits: 3 })

const signed = (negative: boolean, text: string) => (negative ? `${MINUS}${text}` : text)

/** Integer cents as whole dollars: "$12,480", "−$180". */
export function formatDollars(cents: number): string {
  const dollars = Math.round(Math.abs(cents) / 100)
  return signed(cents < 0 && dollars > 0, `$${wholeNumber.format(dollars)}`)
}

/** Integer cents with the cents shown, for itemized money: "$87.09", "−$1,200.00". */
export function formatDollarsAndCents(cents: number): string {
  return signed(cents < 0, `$${twoDecimals.format(Math.abs(cents) / 100)}`)
}

/** A change in whole dollars, always signed unless zero: "+$2,100", "−$180", "$0". */
export function formatDollarChange(cents: number): string {
  const text = formatDollars(cents)
  return text === '$0' || cents < 0 ? text : `+${text}`
}

/** A count to three significant figures: "10", "84.2k", "1.2M". */
export function formatCompact(value: number): string {
  return signed(value < 0, compactNumber.format(Math.abs(value)).replace('K', 'k'))
}

/** A whole count with separators: "84,200". */
export function formatCount(value: number): string {
  return signed(Math.round(value) < 0, wholeNumber.format(Math.abs(Math.round(value))))
}

/** A change in a count, always signed unless zero: "+2,100", "−38". */
export function formatCountChange(value: number): string {
  const text = formatCount(value)
  return text === '0' || text.startsWith(MINUS) ? text : `+${text}`
}

/** The unit on every traffic figure. The glossary defines it by the same text. */
export const RPS_UNIT = '/s'

/** Traffic in rps: "2.5/s", "143/s", "5.12k/s". */
export function formatRps(rps: number): string {
  return `${formatCompact(rps)}${RPS_UNIT}`
}

/** Latency: "940 ms", "11,135 ms". */
export function formatMs(ms: number): string {
  return `${wholeNumber.format(Math.round(ms))} ms`
}

/**
 * Utilization (0..1) as a whole percent, rounded down so a figure never reaches a status
 * threshold its node hasn't: a healthy node at 0.7499 reads 74%, not 75%.
 */
export function formatUtilization(utilization: number): string {
  // The epsilon keeps float noise such as 0.29999999999999993 from reading as 29%.
  return `${Math.floor(utilization * 100 + 1e-9)}%`
}

/** An error rate (0..1) to one decimal place, never rounding a non-zero rate to nothing: "2.4%", "<0.1%". */
export function formatErrorRate(rate: number): string {
  if (rate === 0) return '0%'
  if (rate < 0.001) return '<0.1%'
  return `${(rate * 100).toFixed(1)}%`
}

/** Reputation (0..1) to two places: "0.71". */
export function formatReputation(reputation: number): string {
  return reputation.toFixed(2)
}

/** The warning threshold as the report words it: "75%". */
export const WARNING_PERCENT = formatUtilization(BALANCE.status.warningUtilization)
