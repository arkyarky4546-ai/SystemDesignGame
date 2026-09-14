/**
 * Every tunable number in the game lives here and nowhere else (ADR-0007), so the
 * balance harness can sweep them and a human can read the tuning in one sitting.
 * Empty until M2 introduces the economy.
 */
export const BALANCE = {} as const
