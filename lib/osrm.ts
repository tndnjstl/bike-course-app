export interface Coordinate {
  lat: number
  lng: number
}

export interface RouteStep {
  name: string
  distance: number
  mode: string   // 'cycling' | 'pushing bike' | 'ferry' | ...
}

export interface RouteLeg {
  distance: number  // meters
  duration: number  // seconds (realistic cycling time)
}

export interface RouteResult {
  distance: number   // meters
  duration: number   // seconds (realistic cycling time)
  geometry: Coordinate[]
  steps: RouteStep[]
  legs: RouteLeg[]
}

// OSRM 공개 서버의 자전거 속도 계산이 부정확해서 15km/h 기준으로 직접 계산
const BIKE_MPS = 15000 / 3600  // 15 km/h → m/s
function realisticSecs(distanceM: number) {
  return Math.round(distanceM / BIKE_MPS)
}

export function guessStepType(step: RouteStep): 'bike' | 'road' | 'push' {
  if (step.mode === 'pushing bike') return 'push'
  const n = step.name.toLowerCase()
  if (
    n.includes('자전거') ||
    n.includes('bike') ||
    n.includes('cycle') ||
    n.includes('bicycle') ||
    n.includes('공원길') ||
    n.includes('레일') ||
    n.includes('산책로')
  ) return 'bike'
  return 'road'
}

export async function calcBikeRoute(
  waypoints: Coordinate[],
  profile: 'bike' | 'foot' = 'bike'
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null

  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return null

    const route = data.routes[0]
    const geometry: Coordinate[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    )

    const steps: RouteStep[] = []
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        if (step.distance < 5) continue  // 극소 구간 제외
        steps.push({
          name: step.name || '',
          distance: step.distance,
          mode: step.mode || 'cycling',
        })
      }
    }

    const legs: RouteLeg[] = (route.legs ?? []).map((leg: any) => ({
      distance: leg.distance,
      duration: realisticSecs(leg.distance),
    }))

    return {
      distance: route.distance,
      duration: realisticSecs(route.distance),
      geometry,
      steps,
      legs,
    }
  } catch {
    return null
  }
}

export async function calcBikeRouteAlternatives(
  waypoints: Coordinate[],
  profile: 'bike' | 'foot' | 'car' = 'bike'
): Promise<RouteResult[]> {
  if (waypoints.length < 2) return []

  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&alternatives=3&steps=true`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return []

    return data.routes.map((route: any) => {
      const steps: RouteStep[] = []
      for (const leg of route.legs ?? []) {
        for (const step of leg.steps ?? []) {
          if (step.distance < 5) continue
          steps.push({ name: step.name || '', distance: step.distance, mode: step.mode || 'cycling' })
        }
      }
      const legs: RouteLeg[] = (route.legs ?? []).map((leg: any) => ({
        distance: leg.distance,
        duration: realisticSecs(leg.distance),
      }))
      return {
        distance: route.distance,
        duration: realisticSecs(route.distance),
        geometry: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
        steps,
        legs,
      }
    })
  } catch {
    return []
  }
}

export function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)}km`
    : `${Math.round(meters)}m`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

export function extractWaypoints(geometry: Coordinate[], max = 5): Coordinate[] {
  if (geometry.length <= max) return geometry
  const step = Math.floor(geometry.length / (max - 1))
  const result: Coordinate[] = []
  for (let i = 0; i < max - 1; i++) result.push(geometry[i * step])
  result.push(geometry[geometry.length - 1])
  return result
}
