/**
 * Every tunable number in the game lives here and nowhere else (ADR-0007), so the
 * balance harness can sweep them and a human can read the tuning in one sitting.
 */
export const BALANCE = {
  queueing: {
    /**
     * U_MAX from 02-SIMULATION §5.2, unitless. Caps utilization so latency stays finite
     * when load meets or exceeds capacity; the excess load is reported as drops instead.
     */
    maxUtilization: 0.995,
  },
} as const
