import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRANDING } from './config/branding'
import type { PricedCatalog } from './engine'
import type { SaveStorage } from './state/save'
import { createGameStore } from './state/store'
import { App } from './ui/App'
import './ui/index.css'

document.title = BRANDING.name

// M3 can't advance a turn, so the store gets no component figures yet. M4 supplies the
// content catalog; until then an Advance would report an unknown tier rather than run on
// invented numbers.
const CATALOG_UNTIL_M4: PricedCatalog = { 'app-server': [], database: [] }

const store = createGameStore({ storage: browserStorage(), catalog: CATALOG_UNTIL_M4, now: () => new Date() })
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
