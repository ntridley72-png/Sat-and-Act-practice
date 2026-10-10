import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { getScores } from '../data'
import { readableTime, Scores } from './LeaderBoard'
import type { SavedScore } from '../data'

export const Finished = (): JSX.Element => {
  const [reset, time] = useStore(({ actions: { reset }, finished }) => [reset, finished])
  const [scores, setScores] = useState<SavedScore[]>([])

  const updateScores = () => {
    getScores().then(setScores)
  }

  useEffect(updateScores, [time])

  return (
    <div className="finished">
      <div className="finished-header">
        <h1>Good job! Your time was {readableTime(time)} seconds</h1>
      </div>
      <div className="finished-leaderboard">
        <Scores className="leaderboard" scores={scores} />
      </div>
      <div className="finished-restart">
        <button className="restart-btn" onClick={reset}>
          Restart
        </button>
      </div>
    </div>
  )
}
