import type { Architecture, GridPosition } from '../../engine'

// Canvas geometry in SVG user units, which are CSS pixels at zoom 1. Every node is the same
// size and sits centered in one grid cell (01-ARCHITECTURE §5).

export const CELL_WIDTH = 168
export const CELL_HEIGHT = 112
export const NODE_WIDTH = 128
export const NODE_HEIGHT = 64
/** Space between a node and its cell's edge, where edges route. */
const GUTTER_X = (CELL_WIDTH - NODE_WIDTH) / 2
const GUTTER_Y = (CELL_HEIGHT - NODE_HEIGHT) / 2
/** Empty cells kept beyond the furthest node, so there is always somewhere to drop. */
const SPARE_CELLS = 2
// Five columns (840px) fit the canvas column at 1440px without a scrollbar.
const MIN_COLS = 5
const MIN_ROWS = 5

export type Point = { readonly x: number; readonly y: number }

/** Top-left corner of the node box drawn in a cell. */
export function nodeOrigin(position: GridPosition): Point {
  return { x: position.col * CELL_WIDTH + GUTTER_X, y: position.row * CELL_HEIGHT + GUTTER_Y }
}

/** The cell under a canvas point, clamped to the grid's top-left. */
export function cellAt(point: Point): GridPosition {
  return { col: Math.max(0, Math.floor(point.x / CELL_WIDTH)), row: Math.max(0, Math.floor(point.y / CELL_HEIGHT)) }
}

/** Grid size in cells: enough to show every node plus spare room, never below a minimum. */
export function gridSize(architecture: Architecture): { readonly cols: number; readonly rows: number } {
  const cols = Math.max(MIN_COLS, ...architecture.nodes.map((node) => node.position.col + 1 + SPARE_CELLS))
  const rows = Math.max(MIN_ROWS, ...architecture.nodes.map((node) => node.position.row + 1 + SPARE_CELLS))
  return { cols, rows }
}

/** Where connections leave a node (bottom center) and enter one (top center). */
export function outPort(origin: Point): Point {
  return { x: origin.x + NODE_WIDTH / 2, y: origin.y + NODE_HEIGHT }
}

export function inPort(origin: Point): Point {
  return { x: origin.x + NODE_WIDTH / 2, y: origin.y }
}

/**
 * An orthogonal path from a source node's out port to a target node's in port, given both
 * nodes' origins. Requests flow downward. A target below the source routes through the
 * gutter under the source; a target level with or above it loops out beside the higher
 * node's column and comes in from above. Paths don't avoid other nodes.
 */
export function edgePath(sourceOrigin: Point, targetOrigin: Point): string {
  const start = outPort(sourceOrigin)
  const end = inPort(targetOrigin)
  if (end.y > start.y) {
    const turnY = start.y + GUTTER_Y
    return `M ${start.x} ${start.y} V ${turnY} H ${end.x} V ${end.y}`
  }
  const belowSource = start.y + GUTTER_Y
  const aboveTarget = end.y - GUTTER_Y
  const sideX = Math.max(sourceOrigin.x, targetOrigin.x) + NODE_WIDTH + GUTTER_X
  return `M ${start.x} ${start.y} V ${belowSource} H ${sideX} V ${aboveTarget} H ${end.x} V ${end.y}`
}
