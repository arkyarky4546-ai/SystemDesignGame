/**
 * Captures a pointer so a drag keeps receiving events after it leaves the element. Capture
 * is an improvement, not a requirement. Browsers throw `NotFoundError` for a pointer they
 * don't consider active, and the drag should carry on without capture.
 */
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId)
  } catch {
    // Without capture, the drag still works while the pointer stays over the element.
  }
}
