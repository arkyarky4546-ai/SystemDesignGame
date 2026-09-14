import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from 'react'
import { GLOSSARY, type TermId } from '../glossary'

type TermGroupValue = {
  readonly open: TermId | null
  readonly toggle: (term: TermId) => void
  readonly definitionId: string
}

const TermGroupContext = createContext<TermGroupValue | null>(null)

// The ::after box widens a word-sized button into a fingertip-sized target without moving text.
const TERM =
  'relative cursor-pointer underline decoration-flow decoration-dotted underline-offset-4 after:absolute after:-inset-1 hover:text-ink-bright aria-expanded:text-flow'

/**
 * Interface that uses defined terms, followed by the place their definitions appear (M4a). A
 * definition opens by click, tap, Enter or Space, never by hover alone. One shows at a time,
 * and pressing its term again hides it.
 */
export function TermGroup({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  const [open, setOpen] = useState<TermId | null>(null)
  const definitionId = useId()
  const toggle = useCallback((term: TermId) => setOpen((current) => (current === term ? null : term)), [])
  const value = useMemo(() => ({ open, toggle, definitionId }), [open, toggle, definitionId])

  return (
    <div className={className}>
      <TermGroupContext value={value}>{children}</TermGroupContext>
      {/* Always rendered, so a screen reader announces a definition as it appears. */}
      <div id={definitionId} aria-live="polite">
        {open && (
          <p className="mt-1 max-w-[68ch] border-l-2 border-flow pl-2 text-left font-sans text-xs leading-relaxed font-normal text-ink">
            {GLOSSARY[open].definition}
          </p>
        )}
      </div>
    </div>
  )
}

/** A defined term, shown in the words the interface already uses for it. */
export function Term({ id, children }: { readonly id: TermId; readonly children: ReactNode }) {
  const group = useContext(TermGroupContext)
  if (!group) throw new Error('A Term needs a TermGroup around it to show its definition.')
  return (
    <button type="button" aria-expanded={group.open === id} aria-controls={group.definitionId} className={TERM} onClick={() => group.toggle(id)}>
      {children}
    </button>
  )
}

/**
 * A label that starts with a defined term, such as "p99 latency": the term's words open its
 * definition and the rest stays plain. A label that doesn't start with them renders as text.
 */
export function TermLabel({ id, text }: { readonly id: TermId; readonly text: string }) {
  const { words } = GLOSSARY[id]
  if (!text.toLowerCase().startsWith(words.toLowerCase())) return <>{text}</>
  return (
    <>
      <Term id={id}>{text.slice(0, words.length)}</Term>
      {text.slice(words.length)}
    </>
  )
}
