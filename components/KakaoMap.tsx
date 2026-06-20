'use client'

import { useEffect, useRef } from 'react'
import type { Coordinate } from '@/lib/osrm'
import type { RoadType } from '@/lib/roadtype'

export interface RouteSegment {
  coords: Coordinate[]
  type: RoadType
}

interface Props {
  waypoints: Coordinate[]
  routeGeometry: Coordinate[]
  routeSegments?: RouteSegment[]   // 색상 분리된 구간 (있으면 우선 사용)
  onMapClick?: (coord: Coordinate) => void
}

const SEGMENT_COLOR: Record<RoadType, string> = {
  bike: '#22c55e',   // 초록 — 자전거도로
  road: '#3b82f6',   // 파랑 — 일반도로
}

export default function KakaoMap({ waypoints, routeGeometry, routeSegments, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
  const LRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!containerRef.current || mapRef.current) return
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as any)
      if (cancelled || !containerRef.current) return
      LRef.current = L
      mapRef.current = L.map(containerRef.current, { center: [37.5665, 126.978], zoom: 13, zoomControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 19,
      }).addTo(mapRef.current)
      if (onMapClick) {
        mapRef.current.on('click', (e: any) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }))
      }
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 마커 업데이트
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    waypoints.forEach((wp, i) => {
      const label = i === 0 ? '출발' : i === waypoints.length - 1 ? '도착' : `경유${i}`
      const color = i === 0 ? '#16a34a' : i === waypoints.length - 1 ? '#dc2626' : '#2563eb'
      const icon = L.divIcon({
        html: `<div style="position:relative;width:0;height:0"><span style="position:absolute;bottom:4px;left:0;transform:translateX(-50%);white-space:nowrap;background:${color};color:#fff;border-radius:5px;padding:3px 9px;font-size:11px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,.45);pointer-events:none">${label}</span></div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      })
      markersRef.current.push(L.marker([wp.lat, wp.lng], { icon }).addTo(map))
    })
  }, [waypoints])

  // 경로 폴리라인 업데이트 (색상 분리 지원)
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    polylinesRef.current.forEach(p => p.remove())
    polylinesRef.current = []

    if (routeSegments && routeSegments.length > 0) {
      // 자전거도로/일반도로 색상 구분
      let allBounds: [number, number][] = []
      for (const seg of routeSegments) {
        if (seg.coords.length < 2) continue
        const latlngs = seg.coords.map(p => [p.lat, p.lng] as [number, number])
        const color = SEGMENT_COLOR[seg.type]
        const pl = L.polyline(latlngs, { color, weight: 5, opacity: 0.9 }).addTo(map)
        polylinesRef.current.push(pl)
        allBounds = allBounds.concat(latlngs)
      }
      if (allBounds.length > 1) {
        map.fitBounds(allBounds, { padding: [30, 30] })
      }
    } else if (routeGeometry.length > 1) {
      const latlngs = routeGeometry.map(p => [p.lat, p.lng] as [number, number])
      const pl = L.polyline(latlngs, { color: '#22c55e', weight: 5, opacity: 0.9 }).addTo(map)
      polylinesRef.current.push(pl)
      map.fitBounds(pl.getBounds(), { padding: [30, 30] })
    } else if (waypoints.length > 0) {
      map.setView([waypoints[0].lat, waypoints[0].lng], 14)
    }
  }, [routeGeometry, routeSegments]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} data-testid="kakao-map" className="w-full h-full" />
}
