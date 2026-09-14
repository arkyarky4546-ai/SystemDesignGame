import { usersForMeanRps, type RunState } from '../../engine'
import { formatCompact, formatDollars, formatReputation } from '../format'
import type { TurnPlayback } from '../turn-playback'
import { AnimatedNumber } from './AnimatedNumber'

// Users are derived from traffic and fractional; the bar counts whole people.
const formatUsers = (users: number) => formatCompact(Math.round(users))

type StatusBarProps = {
  readonly run: RunState
  readonly playback: TurnPlayback | null
}

/**
 * The run's vital signs, always visible (05-UI-DESIGN §3). Cash, users and reputation are
 * the three numbers the player manages, so they never have to go looking for them.
 */
export function StatusBar({ run, playback }: StatusBarProps) {
  const before = playback?.before
  const users = usersForMeanRps(run.workload.meanRps)

  return (
    <dl aria-label="Run status" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <div className="flex items-baseline gap-1">
        <dt>week</dt>
        <dd className="num text-ink-bright">{run.turn}</dd>
      </div>
      <div className="flex items-baseline gap-1">
        <dt className="sr-only">cash</dt>
        <dd>
          <AnimatedNumber value={run.cashCents} from={before?.cashCents} format={formatDollars} playback={playback} className="text-ink-bright" />
        </dd>
      </div>
      <div className="flex items-baseline gap-1">
        <dt className="sr-only">users</dt>
        <dd>
          <AnimatedNumber
            value={users}
            from={before ? usersForMeanRps(before.workload.meanRps) : undefined}
            format={formatUsers}
            playback={playback}
            className="text-ink-bright"
          />{' '}
          <span aria-hidden="true">users</span>
        </dd>
      </div>
      <div className="flex items-baseline gap-1">
        <dt>rep</dt>
        <dd>
          <AnimatedNumber value={run.reputation} from={before?.reputation} format={formatReputation} playback={playback} className="text-ink-bright" />
        </dd>
      </div>
      <div className="flex items-baseline gap-1">
        <dt>act</dt>
        <dd className="num text-ink-bright">{run.act}</dd>
      </div>
    </dl>
  )
}
