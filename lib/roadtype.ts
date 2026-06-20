import type { Coordinate } from './osrm'

export type RoadType = 'bike' | 'road'

function sampleGeometry(coords: Coordinate[], max: number): Coordinate[] {
  if (coords.length <= max) return coords
  const step = (coords.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)])
}

// Overpass에서 경로 bbox 안의 자전거 전용 도로 노드를 가져와서
// 각 샘플 포인트가 자전거도로 위에 있는지 판별 (20m 이내)
export async function classifyRoutePoints(
  geometry: Coordinate[],
  sampleCount = 30
): Promise<RoadType[]> {
  const sampled = sampleGeometry(geometry, sampleCount)
  if (!sampled.length) return []

  const lats = sampled.map(p => p.lat)
  const lngs = sampled.map(p => p.lng)
  const south = (Math.min(...lats) - 0.002).toFixed(6)
  const north = (Math.max(...lats) + 0.002).toFixed(6)
  const west  = (Math.min(...lngs) - 0.002).toFixed(6)
  const east  = (Math.max(...lngs) + 0.002).toFixed(6)
  const bbox  = `${south},${west},${north},${east}`

  // 자전거 전용/지정 도로 쿼리 (cycleway, path with bicycle=designated, 자전거 차선 등)
  const query = `[out:json][timeout:15];(
    way["highway"="cycleway"](${bbox});
    way["highway"="path"]["bicycle"="designated"](${bbox});
    way["highway"="track"]["bicycle"="yes"](${bbox});
    way["highway"="footway"]["bicycle"="yes"](${bbox});
    way["cycleway"~"(lane|track|yes)"](${bbox});
    way["cycleway:left"~"(lane|track)"](${bbox});
    way["cycleway:right"~"(lane|track)"](${bbox});
  );out geom;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`overpass ${res.status}`)
    const data = await res.json()

    // 자전거도로의 모든 노드 좌표 수집
    const bikeNodes: Coordinate[] = []
    for (const el of data.elements ?? []) {
      for (const nd of el.geometry ?? []) {
        bikeNodes.push({ lat: nd.lat, lng: nd.lon })
      }
    }

    if (!bikeNodes.length) return sampled.map(() => 'road')

    // 각 샘플 포인트에서 20m 이내에 자전거도로 노드가 있으면 'bike'
    return sampled.map(pt => {
      const cosLat = Math.cos(pt.lat * Math.PI / 180)
      const near = bikeNodes.some(bn => {
        const dy = (bn.lat - pt.lat) * 111320
        const dx = (bn.lng - pt.lng) * 111320 * cosLat
        return dx * dx + dy * dy < 400  // 20m²
      })
      return near ? 'bike' : 'road'
    })
  } catch {
    return sampled.map(() => 'road')
  }
}
