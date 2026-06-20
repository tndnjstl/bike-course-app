export interface Coordinate {
  lat: number
  lng: number
}

export interface RouteResult {
  distance: number   // meters
  duration: number   // seconds
  geometry: Coordinate[]
}

export async function calcBikeRoute(
  waypoints: Coordinate[],
  profile: 'bike' | 'foot' = 'bike'
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null

  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&alternatives=false`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return null

    const route = data.routes[0]
    const geometry: Coordinate[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    )

    return {
      distance: route.distance,
      duration: route.duration,
      geometry,
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
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&alternatives=3`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return []

    return data.routes.map((route: any) => ({
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => ({ lat, lng })
      ),
    }))
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
