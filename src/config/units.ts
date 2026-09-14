// Unit conversions. These are definitions rather than tuning, so they live apart from
// BALANCE, but still in config/ so engine code carries no bare numbers (ADR-0007).

/** Requests in the "thousand requests" that revenue is priced per. */
export const REQUESTS_PER_THOUSAND = 1_000

/** Kilobytes per gigabyte, decimal, as 02-SIMULATION §6's bandwidth formula divides by. */
export const KB_PER_GB = 1_000_000
