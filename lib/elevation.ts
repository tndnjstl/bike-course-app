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

// 데이터셋 우선순위: aster30m(아시아 전역 30m) → srtm30m(전 세계 ~1km)
const DATASETS = ['aster30m', 'srtm30m']

async function fetchDataset(dataset: string, locations: string): Promise<any> {
  const res = await fetch(
    `https://api.opentopodata.org/v1/${dataset}?locations=${locations}`,
    { signal: AbortSignal.timeout(12000) }
  )
  if (!res.ok) throw new Error(`${dataset} ${res.status}`)
  const data = await res.json()
  if (data.status !== 'OK') throw new Error(`${dataset} status:${data.status}`)
  return data
}

export async function fetchElevationProfile(geometry: Coordinate[]): Promise<ElevationPoint[]> {
  const sampled = sampleGeometry(geometry, 30)
  const locations = sampled.map(c => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join('|')

  let data: any = null
  for (const ds of DATASETS) {
    try {
      data = await fetchDataset(ds, locations)
      break
    } catch {
      // 다음 데이터셋 시도
    }
  }
  if (!data) throw new Error('모든 고도 API 실패')

  let cumDist = 0
  return data.results.map((r: any, i: number) => {
    if (i > 0) cumDist += haversineDistance(sampled[i - 1], sampled[i])
    return { distance: cumDist, elevation: r.elevation ?? 0 }
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
