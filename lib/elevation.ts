import type { Coordinate } from './osrm'

export interface ElevationPoint {
  distance: number
  elevation: number
}

export interface ElevationStats {
  maxGrade: number
  totalAscent: number
  totalDescent: number
}

function haversineDistance(a: Coordinate, b: Coordinate): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lng - a.lng) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const x = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function sampleGeometry(coords: Coordinate[], max: number): Coordinate[] {
  if (coords.length <= max) return coords
  const step = (coords.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)])
}

async function fetchOpenMeteo(coords: Coordinate[]): Promise<number[]> {
  const lats = coords.map(c => c.lat.toFixed(5)).join(',')
  const lons = coords.map(c => c.lng.toFixed(5)).join(',')
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data.elevation)) throw new Error('no elevation array')
  return data.elevation as number[]
}

async function fetchOpenTopo(coords: Coordinate[]): Promise<number[]> {
  const locations = coords.map(c => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join('|')
  for (const ds of ['aster30m', 'srtm30m']) {
    try {
      const res = await fetch(
        `https://api.opentopodata.org/v1/${ds}?locations=${locations}`,
        { signal: AbortSignal.timeout(12000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.status !== 'OK') continue
      return (data.results as any[]).map(r => r.elevation ?? 0)
    } catch { /* try next */ }
  }
  throw new Error('opentopodata 실패')
}

export async function fetchElevationProfile(geometry: Coordinate[]): Promise<ElevationPoint[]> {
  const sampled = sampleGeometry(geometry, 30)

  let elevations: number[]
  try {
    elevations = await fetchOpenMeteo(sampled)
  } catch {
    elevations = await fetchOpenTopo(sampled)
  }

  let cumDist = 0
  return sampled.map((coord, i) => {
    if (i > 0) cumDist += haversineDistance(sampled[i - 1], coord)
    return { distance: cumDist, elevation: elevations[i] ?? 0 }
  })
}

export function calcElevationStats(points: ElevationPoint[]): ElevationStats {
  let maxGrade = 0
  let totalAscent = 0
  let totalDescent = 0

  for (let i = 1; i < points.length; i++) {
    const dElev = points[i].elevation - points[i - 1].elevation
    const dDist = points[i].distance - points[i - 1].distance
    if (dDist > 0) {
      const grade = Math.abs(dElev / dDist) * 100
      if (grade > maxGrade) maxGrade = grade
    }
    if (dElev > 0) totalAscent += dElev
    else totalDescent += Math.abs(dElev)
  }

  return { maxGrade, totalAscent: Math.round(totalAscent), totalDescent: Math.round(totalDescent) }
}
