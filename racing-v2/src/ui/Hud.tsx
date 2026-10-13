/* The HUD: speed, boost, lap clock, minimap and leaderboard.
 *
 * Rendered as DOM over the canvas rather than in the 3D scene, because text
 * drawn in WebGL costs a texture and reads worse at every resolution.
 *
 * LIVE VALUES ARE WRITTEN IMPERATIVELY, not through React state. Speed, boost
 * and lap time change every frame; routing them through setState would
 * re-render the HUD 60 times a second and, with the leaderboard, reconcile a
 * list each time. This is the same split upstream's store.ts makes and the
 * reason its frame loop does not thrash React: zustand for things that
 * actually change the UI's shape, a mutable object for per-frame numbers.
 */
import { useEffect, useRef } from 'react'
import { playerMutation } from '../player/config'
import { mutation } from '../ai/mutation'
import type { RacingLine } from '../ai/racingLine'
import type { RunMode } from '../economy'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds * 100) % 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export interface HudProps {
  sandbox?: boolean
  onFinish?: () => void
  line: RacingLine
  opponents: number
  /** Null until the race has started. */
  startedAt: number | null
  /** Session mode for the badge, updated imperatively like everything else. */
  mode: RunMode
  /** The scored-run clock (live, read every frame; rendered as a countdown). */
  clock: { current: { mode: RunMode; active: boolean; remaining: number } }
}

/** "4:59" — a countdown, not a stopwatch: whole seconds, ceiling. */
function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Hud({ line, opponents, startedAt, mode, clock, sandbox = false, onFinish }: HudProps) {
  const speedEl = useRef<HTMLDivElement>(null)
  const boostEl = useRef<HTMLDivElement>(null)
  const clockEl = useRef<HTMLDivElement>(null)
  const modeEl = useRef<HTMLDivElement>(null)
  const boardEl = useRef<HTMLOListElement>(null)
  const mapEl = useRef<HTMLCanvasElement>(null)
  const scoreEl = useRef<HTMLDivElement>(null)
  const comboEl = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    // Reused across frames so the update loop allocates nothing.
    const order: { id: string; progress: number; lap: number; you: boolean }[] = []

    const draw = () => {
      raf = requestAnimationFrame(draw)

      if (speedEl.current) {
        speedEl.current.textContent = String(Math.round(playerMutation.speed * 3.6))
      }
      if (scoreEl.current) scoreEl.current.textContent = Math.floor(playerMutation.driftScore).toLocaleString()
      if (comboEl.current) comboEl.current.textContent = 'x' + playerMutation.driftCombo.toFixed(1)
      if (boostEl.current) {
        boostEl.current.style.width = `${Math.max(0, Math.min(100, playerMutation.boost))}%`
      }
      if (clockEl.current) {
        clockEl.current.textContent = startedAt === null ? '0:00.00' : formatTime((performance.now() - startedAt) / 1000)
      }
      if (modeEl.current) {
        modeEl.current.textContent = mode === 'scored'
          ? `SCORED · ${fmtCountdown(clock.current.remaining)} LEFT`
          : 'OPEN PRACTICE'
      }

      // --- leaderboard, by distance covered ------------------------------
      if (boardEl.current) {
        order.length = 0
        order.push({ id: 'You', progress: mutation.player.progress, lap: mutation.player.lap, you: true })
        for (let i = 0; i < mutation.count; i++) {
          const o = mutation.opponents[i]
          if (o.active) order.push({ id: `CAR ${i + 1}`, progress: o.progress, lap: o.lap, you: false })
        }
        order.sort((a, b) => b.lap * line.length + b.progress - (a.lap * line.length + a.progress))
        // Rewriting textContent on existing nodes beats rebuilding the list:
        // the row count only changes when the grid does.
        const rows = boardEl.current.children
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as HTMLLIElement
          const entry = order[i]
          if (!entry) { row.style.display = 'none'; continue }
          row.style.display = ''
          row.textContent = `${i + 1}. ${entry.id}`
          row.style.color = entry.you ? '#ffd166' : 'rgba(255,255,255,.72)'
        }
      }

      // --- minimap -------------------------------------------------------
      const canvas = mapEl.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) drawMinimap(ctx, canvas, line)
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [line, startedAt, mode, clock])

  return (
    <div className="rv2-hud">
      <div className="rv2-corner rv2-tl">
        <button type="button" className="rv2-recover" onClick={() => { playerMutation.resetRequest++ }}>Reset Position</button>
        {onFinish && <button type="button" className="rv2-recover rv2-end-run" onClick={onFinish}>End Run</button>}
        <div className="rv2-label">{sandbox ? 'DRIVING TIME' : 'LAP TIME'}</div>
        <div ref={clockEl} className="rv2-clock">0:00.00</div>
        <div ref={modeEl} className="rv2-mode">{mode === 'scored' ? `SCORED · ${fmtCountdown(clock.current.remaining)} LEFT` : 'OPEN PRACTICE'}</div>
      </div>

      {!sandbox && <div className="rv2-corner rv2-tr">
        <canvas ref={mapEl} width={168} height={168} className="rv2-map" />
      </div>}

      <div className="rv2-corner rv2-bl">
        {sandbox ? <>
          <div className="rv2-label">DRIFT SCORE</div>
          <div ref={scoreEl} className="rv2-clock">0</div>
          <div ref={comboEl} className="rv2-mode">x1.0</div>
        </> : <ol ref={boardEl} className="rv2-board">
          {Array.from({ length: opponents + 1 }, (_, i) => <li key={i} />)}
        </ol>}
      </div>

      <div className="rv2-corner rv2-br">
        <div className="rv2-speed">
          <span ref={speedEl}>0</span>
          <small>km/h</small>
        </div>
        <div className="rv2-boost-track">
          <div ref={boostEl} className="rv2-boost-fill" />
        </div>
      </div>
    </div>
  )
}

/* Minimap: the circuit plus every car. Redrawn each frame on a 168px canvas,
 * which is cheap enough to not bother diffing. The transform is recomputed
 * per frame rather than cached because it depends only on the line, and
 * caching it would be the kind of premature optimisation that later breaks
 * when the circuit becomes selectable. */
function drawMinimap(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, line: RacingLine) {
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const step = line.length / 120
  for (let d = 0; d < line.length; d += step) {
    const p = line.at(d)
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const pad = 12
  const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY))
  const ox = pad - minX * scale
  const oy = pad - minY * scale
  const tx = (x: number) => ox + x * scale
  const ty = (y: number) => oy + y * scale

  ctx.beginPath()
  for (let d = 0; d <= line.length; d += step) {
    const p = line.at(d % line.length)
    if (d === 0) ctx.moveTo(tx(p.x), ty(p.y))
    else ctx.lineTo(tx(p.x), ty(p.y))
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(255,255,255,.3)'
  ctx.lineWidth = 3
  ctx.stroke()

  for (let i = 0; i < mutation.count; i++) {
    const o = mutation.opponents[i]
    if (!o.active) continue
    ctx.beginPath()
    ctx.arc(tx(o.x), ty(o.y), 2.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,.65)'
    ctx.fill()
  }
  if (mutation.player.active) {
    ctx.beginPath()
    ctx.arc(tx(mutation.player.x), ty(mutation.player.y), 3.6, 0, Math.PI * 2)
    ctx.fillStyle = '#ffd166'
    ctx.fill()
  }
}
