/* Weather: grip and palette, derived from the variant id.
 *
 * The multipliers are v1's WEATHER table (racing/data/tracks.js) unchanged --
 * they were tuned against a fleet and describe the road, not an engine, so
 * they transfer. Grip reaches physics in three places: the player's wheel
 * friction, the AI's force saturation, and the driver's planning (via its
 * existing `grip` option: a driver that plans dry corner speeds in the rain
 * arrives at every corner too fast and goes straight on).
 *
 * NO THREE IMPORT: the palette dimming is plain hex math so this module can
 * run in the Node harnesses and the validator.
 */
import type { ThemeSpec, WeatherId } from './format'

/** Peak grip as a fraction of dry. Same numbers as v1. */
export const WEATHER_GRIP: Record<WeatherId, number> = {
  dry: 1.0,
  wet: 0.8,
  rain: 0.68,
}

export const WEATHER_LABEL: Record<WeatherId, string> = {
  dry: 'Dry',
  wet: 'Wet',
  rain: 'Rain',
}

/** How much of the original colour survives, per variant. */
const DIM: Record<WeatherId, number> = { dry: 1.0, wet: 0.78, rain: 0.6 }

function scaleHex(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const v = parseInt(m[1], 16)
  const r = Math.round(((v >> 16) & 255) * k)
  const g = Math.round(((v >> 8) & 255) * k)
  const b = Math.round((v & 255) * k)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/** The theme, dimmed for the weather. Pure: same input, same palette. */
export function dimTheme(theme: ThemeSpec, weather: WeatherId): ThemeSpec {
  const k = DIM[weather]
  if (k === 1) return theme
  return {
    sky: {
      top: scaleHex(theme.sky.top, k),
      horizon: scaleHex(theme.sky.horizon, k),
      bottom: scaleHex(theme.sky.bottom, k),
    },
    fog: {
      color: scaleHex(theme.fog.color, k),
      // Fog closes in as the weather worsens; rain should feel smaller.
      near: theme.fog.near * (weather === 'rain' ? 0.7 : 0.85),
      far: theme.fog.far * (weather === 'rain' ? 0.62 : 0.8),
    },
    background: scaleHex(theme.background, k),
    ground: scaleHex(theme.ground, k),
    road: scaleHex(theme.road, k),
    roadEdge: theme.roadEdge,
    roadCentre: theme.roadCentre,
    hemi: { ...theme.hemi, intensity: theme.hemi.intensity * (0.75 + 0.25 * k) },
    key: { ...theme.key, intensity: theme.key.intensity * k },
    rim: { ...theme.rim, intensity: theme.rim.intensity * k },
  }
}

/** Resolve a requested weather against what a track supports. */
export function resolveWeather(requested: WeatherId, supported: readonly WeatherId[]): WeatherId {
  return supported.includes(requested) ? requested : 'dry'
}
