import { useMemo } from 'react'
import type { DiagramSpec } from '../../../content/schema'
import type { NodeId } from '../../../engine'
import { architectureFor } from '../../../state/diagram'
import { ArchitectureCanvas } from '../../canvas/ArchitectureCanvas'

const NOTHING: Readonly<Record<NodeId, number>> = {}

/**
 * A lesson diagram, drawn by the real canvas component (03-CONTENT-SCHEMA §2). Using the same
 * renderer means a diagram can't show something the game can't build, and the architecture it
 * holds is a real one the player could place.
 *
 * It is read-only and at reduced scale (05-UI-DESIGN §6): nothing here is the player's to
 * edit, and it carries no utilization, because a diagram is a shape rather than a week.
 */
export function LessonDiagram({ architecture, caption }: { readonly architecture: DiagramSpec; readonly caption: string }) {
  const built = useMemo(() => architectureFor(architecture), [architecture])

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded border border-panel-line bg-panel-raised p-2">
        <ArchitectureCanvas
          architecture={built}
          utilization={NOTHING}
          edgeFlow={NOTHING}
          playback={null}
          selection={{ kind: 'none' }}
          editable={false}
          zoom={0.75}
          label={caption}
          onSelect={() => {}}
          onChange={() => {}}
          onMessage={() => {}}
        />
      </div>
      <figcaption className="text-sm leading-relaxed">{caption}</figcaption>
    </figure>
  )
}
