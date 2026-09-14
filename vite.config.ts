import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// Tests that assert a wall-clock budget. They run after every other test file has finished,
// one file at a time, so parallel jsdom files can't spend their frame budget (ADR-0039).
const TIMING_TESTS = ['src/state/turn-performance.test.ts', 'src/ui/turn-render-performance.test.tsx']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unit', exclude: [...configDefaults.exclude, ...TIMING_TESTS] } },
      { extends: true, test: { name: 'timing', include: TIMING_TESTS, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
})
