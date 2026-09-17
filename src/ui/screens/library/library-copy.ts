// Library and practice copy (05-UI-DESIGN §8): dry, second person, no exclamation points.
// The library's voice says plainly that looking things up is allowed, because
// 00-GAME-DESIGN §7 makes a point of it.

export const LIBRARY = {
  title: 'Library',
  lead: 'Every concept is readable here, passed or not, on every difficulty. Looking something up is the job, not cheating.',
  search: 'Search the lessons',
  noMatches: 'Nothing matches that. Clearing the search shows everything.',
  backToCanvas: 'Back to canvas',
  passed: '· passed',
  notPassed: '· not passed yet',
  practise: 'Practise this concept',
  tier: (tier: number) => `Tier ${tier}`,
  unlocks: (labels: readonly string[], passed: boolean) =>
    `${passed ? 'Unlocked' : 'Passing its check unlocks'}: ${labels.join(', ')}.`,
} as const

export const PRACTICE = {
  title: (concept: string) => `Practising ${concept}`,
  lead: 'No score, no threshold, and nothing here changes what you have unlocked or what is in the bank.',
  next: 'Next question',
  submit: 'Check answer',
  done: 'Stop practising',
  backToLesson: 'Reread the lesson',
  empty: 'This concept has no questions yet.',
  loading: 'Loading the questions.',
  tally: (right: number, asked: number) => `${right} right of ${asked} asked.`,
} as const
