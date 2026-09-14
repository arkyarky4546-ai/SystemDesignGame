import type { TermId } from '../glossary'

/**
 * Where a label is on screen: the canvas screen as a run opens, the inspector once a component
 * is selected, or the weekly report.
 */
export type GuideScreen = 'planning' | 'selection' | 'report'

/**
 * A step's words: plain text, or the visible label of something on screen, which the guide
 * emphasizes and a test finds. A term label also opens that term's definition.
 */
export type GuidePart =
  | string
  | { readonly kind: 'label'; readonly text: string; readonly shownIn: GuideScreen }
  | { readonly kind: 'term'; readonly text: string; readonly shownIn: GuideScreen; readonly term: TermId }

export type GuideStep = { readonly title: string; readonly body: readonly GuidePart[] }

export type Guide = { readonly title: string; readonly lead: string; readonly steps: readonly GuideStep[] }

const label = (text: string, shownIn: GuideScreen): GuidePart => ({ kind: 'label', text, shownIn })
const term = (text: string, id: TermId, shownIn: GuideScreen): GuidePart => ({ kind: 'term', text, shownIn, term: id })

/**
 * "How a week works" (M4a). Each step names what to look at by its label on screen. The claims
 * it makes about the model, for review:
 * - Every request passes through the app server and the database: true while an app server
 *   makes one query per request (`BALANCE.starter.appFanoutFactor`, pinned by the guide's test).
 * - Latency climbs steeply near capacity: W = serviceTime / (1 − u), 02-SIMULATION §5.2.
 * - A real week can land above the likely range: ADR-0032.
 * - Missing a target costs reputation: 02-SIMULATION §7.
 */
export const WEEK_GUIDE: Guide = {
  title: 'How a week works',
  lead: 'One turn is one week. Size your architecture for next week’s traffic, run the week, then read what happened.',
  steps: [
    {
      title: 'Read the forecast',
      body: [
        label('Forecast for week', 'planning'),
        ' above the canvas gives next week’s peak: the requests per second expected in its busiest hour. Where it shows a likely range, the real week can land above it.',
      ],
    },
    {
      title: 'Select a component',
      body: [
        'Select ',
        label('App server', 'planning'),
        ' on the canvas with a click, or with the arrow keys once the canvas has focus. Its figures open in the ',
        label('Inspector', 'planning'),
        '.',
      ],
    },
    {
      title: 'Size it for the peak',
      body: [
        'The inspector shows ',
        term('Capacity', 'capacity', 'selection'),
        ' at the chosen ',
        label('Size', 'selection'),
        '. Every request passes through the app server and the database, so each needs capacity above the peak, with room to spare: latency climbs steeply as a component nears its capacity.',
      ],
    },
    {
      title: 'Advance the week',
      body: [
        'Next week’s costs, or the reason the week can’t run, show beside ',
        label('Advance week', 'planning'),
        '. Press it when your plan is ready.',
      ],
    },
    {
      title: 'Read the report',
      body: [
        'The weekly report marks ',
        term('p99 latency', 'p99', 'report'),
        ' or ',
        label('Error rate', 'report'),
        ' with ▲ when it misses its target, which costs reputation. Its paragraph names the component under the most pressure, and ',
        label('Back to canvas', 'report'),
        ' returns you here for the next week.',
      ],
    },
  ],
}
