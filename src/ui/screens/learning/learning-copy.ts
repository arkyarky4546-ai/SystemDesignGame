import type { Depth } from '../../../content/schema'

// Player-facing copy for the lesson and check screens (05-UI-DESIGN §8): dry, second
// person, a real verb on every button, failure stated neutrally and never with an
// exclamation point.

export const LESSON = {
  backToCanvas: 'Back to canvas',
  keyNumbers: 'Worth remembering',
  misconceptions: 'Commonly believed, and wrong',
  takeCheck: 'Take the check',
  practise: 'Practise without the check',
  /** Heads the collapsed "go deeper" section; its one-line summary follows (05-UI-DESIGN §6). */
  deeper: 'Go deeper',
  /**
   * Under the primary action, so skipping the check is an informed choice. Not every concept
   * opens something, so the note only promises an unlock when there is one.
   */
  checkNote: (drawCount: number, unlocksSomething: boolean) =>
    `The check asks ${drawCount} questions. Passing it ${unlocksSomething ? 'unlocks what this concept gates and ' : ''}pays a one-time bonus into this run.`,
} as const

export const CHECK = {
  backToLesson: 'Reread the lesson',
  backToCanvas: 'Back to canvas',
  retake: 'Retake',
  submit: 'Check answer',
  next: 'Next question',
  finish: 'See your score',
  loading: 'Loading the questions.',
  empty: 'This concept has no questions yet.',
  correct: 'Correct',
  incorrect: 'Not quite',
  partial: 'Partly right',
  /** Shown above a multi question, since the number of correct options isn't given away. */
  multiHint: 'Select every statement that applies.',
  numericHint: 'Enter a number.',
} as const

/** "Question 2 of 5". */
export function questionPosition(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`
}

/** What a depth asks of the player, shown beside the question number. */
export function depthLabel(depth: Depth): string {
  switch (depth) {
    case 1:
      return 'From the lesson'
    case 2:
      return 'Applying it'
    case 3:
      return 'Weighing it up'
  }
}

/**
 * The score against the threshold, the way 05-UI-DESIGN §8 words it: "4 of 5 — you need 4
 * on Junior." Partial credit can put the score between two whole questions, so it reads to
 * one decimal place only when it isn't whole.
 */
export function scoreLine(score: number, total: number, needed: number, difficulty: string): string {
  return `${formatScore(score)} of ${total} — you need ${formatScore(needed)} on ${capitalize(difficulty)}.`
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

/** What passing just did, for the result screen and the live region that announces it. */
export function passedLine(unlocked: readonly string[], bonus: string | null): string {
  const sizes = unlocked.length > 0 ? `${joinLabels(unlocked)} are unlocked, in this run and every later one.` : ''
  const paid = bonus ? ` ${bonus} is paid into this run for passing it the first time.` : ''
  return `Passed.${sizes ? ` ${sizes}` : ''}${paid}`.trim()
}

export const FAILED_LEAD = 'Not passed. Nothing is lost: reread the lesson or retake it now.'

function joinLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const LOCKED = {
  openLesson: 'Open the lesson',
  /** A whole component the player hasn't earned yet. */
  componentLine: (conceptTitle: string) => `This needs ${conceptTitle}.`,
  /** Suffix on a size the player hasn't earned, inside the inspector's size list. */
  optionSuffix: 'locked',
} as const

export const REDUNDANCY = {
  /** Why the instance count is stuck where it is, and what moves it (02-SIMULATION §5.7). */
  needs: (cap: number, conceptTitle: string) =>
    cap <= 1
      ? `Running a second instance needs ${conceptTitle}, later in the curriculum. Until then, if this one goes down, everything through it goes down with it.`
      : `Running more than ${cap} needs ${conceptTitle}.`,
} as const

/** "Medium, Large and Extra large need Capacity, utilization, and the cliff." */
export function lockedSizesLine(labels: readonly string[], conceptTitle: string): string {
  return `${joinLabels(labels)} need ${conceptTitle}.`
}
