// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { COMPONENT_DEFS } from '../../../content/components'
import { TEST_CATALOG } from '../../../engine/test-helpers'
import { createGameStore } from '../../../state/store'
import { FIXED_NOW, memoryStorage } from '../../../state/test-helpers'
import { CanvasScreen } from './CanvasScreen'

// The starter run: ingress at (0,0) → app at (0,1) → db at (0,2). Cells are 168 × 112 and
// a node's box starts 20 across and 24 down inside its cell (ui/canvas/geometry.ts).
const cellPoint = (col: number, row: number) => ({ clientX: col * 168 + 60, clientY: row * 112 + 40 })
const outPortPoint = (col: number, row: number) => ({ clientX: col * 168 + 84, clientY: row * 112 + 88 })

beforeAll(() => {
  // jsdom has no PointerEvent. A MouseEvent with a pointerId is all React's handlers read.
  if (!('PointerEvent' in window)) {
    class PointerEventShim extends MouseEvent {
      readonly pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventShim })
  }
})

afterEach(cleanup)

function setup() {
  const store = createGameStore({ storage: memoryStorage(), catalog: TEST_CATALOG, now: FIXED_NOW })
  store.getState().startRun(1)
  render(<CanvasScreen store={store} />)
  const canvas = screen.getByRole('application', { name: 'Architecture canvas' })
  // jsdom lays nothing out. Give the canvas its real size at the origin, as a browser would.
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1008, bottom: 560, width: 1008, height: 560, toJSON: () => ({}) })
  const architecture = () => {
    const run = store.getState().run
    if (!run) throw new Error('expected a run')
    return run.architecture
  }
  return { store, canvas, architecture, user: userEvent.setup() }
}

const node = (canvas: HTMLElement, nodeId: string) => {
  const element = canvas.querySelector(`[data-node-id="${nodeId}"]`)
  if (!element) throw new Error(`no node ${nodeId}`)
  return element
}

const status = () => screen.getByRole('status').textContent

describe('canvas with the keyboard alone (M3 acceptance)', () => {
  it('places, connects, reconfigures and deletes without a pointer', async () => {
    const { canvas, architecture, user } = setup()

    // Select the database with the arrow keys, then place a second database below it.
    canvas.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(canvas.getAttribute('aria-activedescendant')).toBe(node(canvas, 'db').id)
    screen.getByRole('button', { name: 'Database' }).focus()
    await user.keyboard('{Enter}')
    expect(architecture().nodes.at(-1)).toMatchObject({ id: 'database-1', position: { col: 0, row: 3 } })
    expect(status()).toBe('Placed Database 2.')

    // Enter starts a connection from the app server; Enter again connects it to the new database.
    canvas.focus()
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}{ArrowDown}{ArrowDown}{Enter}')
    expect(architecture().edges).toContainEqual({ from: 'app', to: 'database-1' })
    expect(status()).toBe('Connected App server to Database 2.')

    // The new database stays selected. Shift and an arrow key moves it one cell.
    expect(canvas.getAttribute('aria-activedescendant')).toBe(node(canvas, 'database-1').id)
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(architecture().nodes.find((n) => n.id === 'database-1')?.position).toEqual({ col: 1, row: 3 })

    // Reconfigure from the inspector's form controls.
    const inspector = screen.getByRole('region', { name: 'Database 2' })
    await user.selectOptions(within(inspector).getByLabelText('Size'), '2')
    expect(architecture().nodes.find((n) => n.id === 'database-1')?.tier).toBe(2)

    // Delete removes the selection and its connections.
    canvas.focus()
    await user.keyboard('{Delete}')
    expect(architecture().nodes.map((n) => n.id)).toEqual(['ingress', 'app', 'db'])
    expect(architecture().edges).toEqual([
      { from: 'ingress', to: 'app' },
      { from: 'app', to: 'db' },
    ])
  })

  it('shows app server fanout as a fact about the app, not a setting (ADR-0034)', async () => {
    const { canvas, user } = setup()
    canvas.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const inspector = screen.getByRole('region', { name: 'App server' })
    expect(within(inspector).getByText(/Database queries per request/).textContent).toBe('Database queries per request 1')
    expect(within(inspector).queryByRole('spinbutton')).toBeNull()
  })

  it('refuses an invalid connection with the specific reason, and cancels with Escape', async () => {
    const { canvas, architecture, user } = setup()
    canvas.focus()
    await user.keyboard('{ArrowDown}{Enter}{ArrowDown}{ArrowDown}{Enter}')
    expect(status()).toBe(COMPONENT_DEFS.ingress.validConnections.refusedDownstream.database)
    expect(architecture().edges).toHaveLength(2)

    // A database can't start a connection, and says where to start instead.
    await user.keyboard('{Enter}')
    expect(status()).toBe('Database doesn’t send requests anywhere. Select the component requests come from, then press Enter.')

    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}{Escape}')
    expect(status()).toBe('Connection cancelled.')
    await user.keyboard('{Delete}')
    expect(status()).toBe('Ingress can’t be removed. It’s where traffic enters your architecture.')
  })
})

describe('canvas with the mouse (M3 acceptance)', () => {
  it('drags a component from the palette onto an empty cell', () => {
    const { canvas, architecture } = setup()
    const button = screen.getByRole('button', { name: 'App server' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(button, { pointerId: 1, ...cellPoint(2, 1) })
    fireEvent.pointerUp(button, { pointerId: 1, ...cellPoint(2, 1) })
    fireEvent.click(button)
    expect(architecture().nodes.map((n) => [n.id, n.position])).toEqual([
      ['ingress', { col: 0, row: 0 }],
      ['app', { col: 0, row: 1 }],
      ['db', { col: 0, row: 2 }],
      ['app-server-1', { col: 2, row: 1 }],
    ])
    expect(canvas.getAttribute('aria-activedescendant')).toBe(node(canvas, 'app-server-1').id)
  })

  it('moves a node by dragging, touching the store only on release', () => {
    const { store, canvas, architecture } = setup()
    let storeUpdates = 0
    const unsubscribe = store.subscribe(() => storeUpdates++)
    const body = node(canvas, 'db').querySelector('[data-part="body"]')
    if (!body) throw new Error('no node body')

    fireEvent.pointerDown(body, { button: 0, pointerId: 7, ...cellPoint(0, 2) })
    for (let step = 1; step <= 20; step++) {
      fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 60 + step * 17, clientY: 264 })
    }
    expect(storeUpdates).toBe(0)
    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 60 + 340, clientY: 264 })
    unsubscribe()

    expect(storeUpdates).toBe(1)
    expect(architecture().nodes.find((n) => n.id === 'db')?.position).toEqual({ col: 2, row: 2 })
  })

  it('refuses dropping a node onto another node and puts it back', () => {
    const { canvas, architecture } = setup()
    const body = node(canvas, 'db').querySelector('[data-part="body"]')
    if (!body) throw new Error('no node body')
    fireEvent.pointerDown(body, { button: 0, pointerId: 2, ...cellPoint(0, 2) })
    fireEvent.pointerMove(canvas, { pointerId: 2, ...cellPoint(0, 1) })
    fireEvent.pointerUp(canvas, { pointerId: 2, ...cellPoint(0, 1) })
    expect(architecture().nodes.find((n) => n.id === 'db')?.position).toEqual({ col: 0, row: 2 })
    expect(status()).toBe('App server is already in that cell. Choose an empty one.')
    expect(node(canvas, 'db').getAttribute('transform')).toBe('translate(20 248)')
  })

  it('connects by dragging from a port, and refuses an invalid pairing with its reason', () => {
    const { canvas, architecture } = setup()
    const ingressPort = node(canvas, 'ingress').querySelector('[data-port="out"]')
    if (!ingressPort) throw new Error('no port')
    fireEvent.pointerDown(ingressPort, { button: 0, pointerId: 3, ...outPortPoint(0, 0) })
    fireEvent.pointerMove(canvas, { pointerId: 3, ...cellPoint(0, 2) })
    fireEvent.pointerUp(canvas, { pointerId: 3, ...cellPoint(0, 2) })
    expect(status()).toBe(COMPONENT_DEFS.ingress.validConnections.refusedDownstream.database)
    expect(architecture().edges).toHaveLength(2)

    const appPort = node(canvas, 'app').querySelector('[data-port="out"]')
    if (!appPort) throw new Error('no port')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Database' }), { button: 0, pointerId: 4, clientX: 1, clientY: 1 })
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Database' }), { pointerId: 4, ...cellPoint(3, 3) })
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Database' }), { pointerId: 4, ...cellPoint(3, 3) })
    fireEvent.pointerDown(appPort, { button: 0, pointerId: 5, ...outPortPoint(0, 1) })
    fireEvent.pointerUp(canvas, { pointerId: 5, ...cellPoint(3, 3) })
    expect(architecture().edges).toContainEqual({ from: 'app', to: 'database-1' })
  })

  it('selects and removes a connection and a component with clicks', async () => {
    const { canvas, architecture, user } = setup()
    const edgeHit = canvas.querySelector(`[data-edge='["app","db"]'] path:last-child`)
    if (!edgeHit) throw new Error('no edge')
    fireEvent.pointerDown(edgeHit, { button: 0, pointerId: 6 })
    await user.click(screen.getByRole('button', { name: 'Remove connection' }))
    expect(architecture().edges).toEqual([{ from: 'ingress', to: 'app' }])

    const body = node(canvas, 'db').querySelector('[data-part="body"]')
    if (!body) throw new Error('no node body')
    fireEvent.pointerDown(body, { button: 0, pointerId: 8, ...cellPoint(0, 2) })
    fireEvent.pointerUp(canvas, { pointerId: 8, ...cellPoint(0, 2) })
    await user.click(screen.getByRole('button', { name: 'Remove Database' }))
    expect(architecture().nodes.map((n) => n.id)).toEqual(['ingress', 'app'])
  })
})

describe('pointer capture', () => {
  it('still drags when the browser refuses to capture the pointer', () => {
    const { canvas, architecture } = setup()
    Object.defineProperty(canvas, 'setPointerCapture', {
      configurable: true,
      value: () => {
        throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
      },
    })
    const body = node(canvas, 'db').querySelector('[data-part="body"]')
    if (!body) throw new Error('no node body')
    fireEvent.pointerDown(body, { button: 0, pointerId: 9, ...cellPoint(0, 2) })
    fireEvent.pointerMove(canvas, { pointerId: 9, ...cellPoint(3, 2) })
    fireEvent.pointerUp(canvas, { pointerId: 9, ...cellPoint(3, 2) })
    expect(architecture().nodes.find((n) => n.id === 'db')?.position).toEqual({ col: 3, row: 2 })
  })
})

describe('utilization (05-UI-DESIGN §4)', () => {
  it('fills each node to last week’s utilization and marks saturation without relying on color', () => {
    // At 10 rps peak, a 20 rps app server runs at 50% and a 10/0.955 rps database at 95.5%.
    const tier = (capacityRps: number) => ({ capacityRps, serviceTimeMs: 10, setupCostCents: 0, runningCostPerTurnCents: 0 })
    const catalog = { 'app-server': [tier(20)], database: [tier(10 / 0.955)] }
    const store = createGameStore({ storage: memoryStorage(), catalog, now: FIXED_NOW })
    store.getState().startRun(1)
    const run = store.getState().run
    if (!run) throw new Error('expected a run')
    const summary = {
      turn: 1, meanRps: 10, peakRps: 10, users: 100, p99Ms: 90, errorRate: 0, revenueCents: 1, costCents: 1,
      setupCostCents: 0, sloMet: true, cashCents: 1, reputation: 0.7, events: [], utilization: {},
    }
    store.setState({ run: { ...run, workload: { ...run.workload, meanRps: 10, peakMultiplier: 1 }, turn: 1, history: [summary] } })
    render(<CanvasScreen store={store} />)
    const canvas = screen.getByRole('application', { name: 'Architecture canvas' })

    expect(node(canvas, 'ingress').getAttribute('data-load')).toBe('unknown')
    const app = node(canvas, 'app')
    expect(app.getAttribute('data-load')).toBe('healthy')
    expect(app.querySelector('[data-part="fill"]')?.getAttribute('height')).toBe('32')
    expect(app.querySelector('[data-part="hatch"]')?.getAttribute('visibility')).toBe('hidden')
    const db = node(canvas, 'db')
    expect(db.getAttribute('data-load')).toBe('saturated')
    expect(db.getAttribute('aria-label')).toContain('saturated')
    expect(db.querySelector('[data-part="hatch"]')?.getAttribute('visibility')).toBe('visible')
    expect(db.textContent).toContain('▲ 95%')
  })

  it('draws busier edges heavier', () => {
    const store = createGameStore({ storage: memoryStorage(), catalog: TEST_CATALOG, now: FIXED_NOW })
    store.getState().startRun(1)
    store.getState().advanceTurn()
    render(<CanvasScreen store={store} />)
    const canvas = screen.getByRole('application', { name: 'Architecture canvas' })
    const width = (key: string) => Number(canvas.querySelector(`[data-edge='${key}'] [data-part="line"]`)?.getAttribute('stroke-width'))
    const lastTurn = store.getState().ui.lastTurn
    const [intoApp, intoDb] = lastTurn?.result.perEdge ?? []
    expect(intoApp?.rps).toBeGreaterThan(0)
    expect(width('["ingress","app"]')).toBeGreaterThan(0)
    // Fanout 1 carries the same load on both edges, so they're drawn the same.
    expect(intoDb?.rps).toBe(intoApp?.rps)
    expect(width('["app","db"]')).toBe(width('["ingress","app"]'))
    expect(canvas.querySelector(`[data-edge='["ingress","app"]']`)?.getAttribute('aria-label')).toMatch(/at peak last week$/)
  })
})
