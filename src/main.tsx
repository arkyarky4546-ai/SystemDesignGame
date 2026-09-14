import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRANDING } from './config/branding'
import { CONTENT_CATALOG } from './state/catalog'
import type { SaveStorage } from './state/save'
import { createGameStore } from './state/store'
import { App } from './ui/App'
import './ui/index.css'

document.title = BRANDING.name

const store = createGameStore({ storage: browserStorage(), catalog: CONTENT_CATALOG, now: () => new Date() })
store.getState().load()
if (!store.getState().run) store.getState().startRun(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing the #root element')

createRoot(root).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)

// Reading `localStorage` itself throws where storage is blocked. Fall back to memory so the
// game still runs; the store reports that saving isn't possible.
function browserStorage(): SaveStorage {
  try {
    return window.localStorage
  } catch {
    const items = new Map<string, string>()
    return {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    }
  }
}
