import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The layer rule from 01-ARCHITECTURE §3: ui → state → engine → content. A layer may
// import any layer to its right and never one to its left (ADR-0017). This is what
// keeps the engine runnable headless in the balance harness.
const uiRuntime = ['react', 'react/*', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*']
const layer = (name) => [`**/${name}`, `**/${name}/**`]

// Node's types are on for tools/, which writes the generated bank (ADR-0044). Nothing under
// src/ may reach a Node API: the app runs in a browser and the engine stays headless. Flat
// config replaces a rule rather than merging it, so every src/ block repeats this.
const noNode = { group: ['node:*'], message: 'src/ runs in a browser. Node APIs belong in tools/.' }

function forbidImports(files, patterns) {
  return {
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns }],
    },
  }
}

export default defineConfig([
  globalIgnores(['dist/', '.wrangler/']),
  tseslint.configs.recommended,
  forbidImports(['src/**/*.{ts,tsx}'], [noNode]),
  forbidImports(
    ['src/engine/**/*.{ts,tsx}'],
    [
      noNode,
      {
        group: uiRuntime,
        message: 'engine/ is pure simulation and must not depend on React or the store.',
      },
      {
        group: [...layer('state'), ...layer('ui')],
        message: 'engine/ may only import content/ (ui → state → engine → content).',
      },
    ],
  ),
  forbidImports(
    ['src/content/**/*.{ts,tsx}'],
    [
      noNode,
      {
        group: uiRuntime,
        message: 'content/ is data and must not depend on React or the store.',
      },
      {
        group: [...layer('engine'), ...layer('state'), ...layer('ui')],
        message: 'content/ is the bottom layer and imports no other layer.',
      },
    ],
  ),
  forbidImports(
    ['src/state/**/*.{ts,tsx}'],
    [
      noNode,
      {
        group: layer('ui'),
        message: 'state/ must not import ui/ (ui → state → engine → content).',
      },
    ],
  ),
])
