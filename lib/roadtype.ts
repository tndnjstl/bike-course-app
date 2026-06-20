import type { Coordinate } from './osrm'

export type RoadType = 'bike' | 'road'

function sampleGeometry(coords: Coordinate[], max: number): Coordinate[] {
  if (coords.length <= max) return coords
  const step = (coords.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)])
}

// 점 pt에서 선분 a→b 까지의 거리(m) 계산
function distToSegment(pt: Coordinate, a: Coordinate, b: Coordinate): number {
  const cosLat = Math.cos(pt.lat * Math.PI / 180)
  const px = (pt.lng - a.lng) * 111320 * cosLat
  const py = (pt.lat - a.lat) * 111320
  const bx = (b.lng - a.lng) * 111320 * cosLat
  const by = (b.lat - a.lat) * 111320
  const len2 = bx * bx + by * by
  if (len2 === 0) return Math.sqrt(px * px + py * py)
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  const dx = px - t * bx
  const dy = py - t * by
  return Math.sqrt(dx * dx + dy * dy)
}

// Overpass에서 경로 bbox 안의 자전거 도로 way를 가져와서
// 각 샘플 포인트가 자전거도로 세그먼트 25m 이내인지 판별
export async function classifyRoutePoints(
  geometry: Coordinate[],
  sampleCount = 30
): Promise<RoadType[]> {
  const sampled = sampleGeometry(geometry, sampleCount)
  if (!sampled.length) return []

  const lats = sampled.map(p => p.lat)
  const lngs = sampled.map(p => p.lng)
  const south = (Math.min(...lats) - 0.003).toFixed(6)
  const north = (Math.max(...lats) + 0.003).toFixed(6)
  const west  = (Math.min(...lngs) - 0.003).toFixed(6)
  const east  = (Math.max(...lngs) + 0.003).toFixed(6)
  const bbox  = `${south},${west},${north},${east}`

  const query = `[out:json][timeout:20];(
    way["highway"="cycleway"](${bbox});
    way["highway"="path"]["bicycle"~"^(yes|designated)$"](${bbox});
    way["highway"="track"]["bicycle"~"^(yes|designated)$"](${bbox});
    way["highway"="footway"]["bicycle"~"^(yes|designated)$"](${bbox});
    way["highway"="residential"]["cycleway"~"."](${bbox});
    way["highway"="secondary"]["cycleway"~"."](${bbox});
    way["highway"="tertiary"]["cycleway"~"."](${bbox});
    way["cycleway"~"^(lane|track|yes|shared_lane)$"](${bbox});
    way["cycleway:left"~"^(lane|track)$"](${bbox});
    way["cycleway:right"~"^(lane|track)$"](${bbox});
    way["bicycle"="designated"](${bbox});
  );out geom;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`overpass ${res.status}`)
    const data = await res.json()

    // 자전거도로의 모든 세그먼트(선분) 수집
    type Seg = [Coordinate, Coordinate]
    const bikeSegs: Seg[] = []
    for (const el of data.elements ?? []) {
      const geom: Coordinate[] = (el.geometry ?? []).map((nd: any) => ({ lat: nd.lat, lng: nd.lon }))
      for (let i = 0; i < geom.length - 1; i++) {
        bikeSegs.push([geom[i], geom[i + 1]])
      }
    }

    if (!bikeSegs.length) return sampled.map(() => 'road')

    const THRESHOLD = 25 // meters — 노드 간격이 넓어도 선분 기준으로 정확하게 판별

    return sampled.map(pt => {
      const near = bikeSegs.some(([a, b]) => distToSegment(pt, a, b) < THRESHOLD)
      return near ? 'bike' : 'road'
    })
  } catch {
    return sampled.map(() => 'road')
  }
}
