'use client'

import { useEffect, useRef } from 'react'
import type { Coordinate } from '@/lib/osrm'

interface Props {
  waypoints: Coordinate[]
  routeGeometry: Coordinate[]
  onMapClick?: (coord: Coordinate) => void
}

export default function KakaoMap({ waypoints, routeGeometry, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const LRef = useRef<any>(null)

  // 지도 초기화 (마운트 1회)
  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!containerRef.current || mapRef.current) return

      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as any)
      if (cancelled || !containerRef.current) return

      LRef.current = L
      const center: [number, number] = [37.5665, 126.978]
      mapRef.current = L.map(containerRef.current, { center, zoom: 13, zoomControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 19,
      }).addTo(mapRef.current)

      if (onMapClick) {
        mapRef.current.on('click', (e: any) => {
          onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
        })
      }
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 마커 & 폴리라인 업데이트
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    // 마커 초기화
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
      const marker = L.marker([wp.lat, wp.lng], { icon }).addTo(map)
      markersRef.current.push(marker)
    })

    // 폴리라인
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null }

    if (routeGeometry.length > 1) {
      const latlngs = routeGeometry.map(p => [p.lat, p.lng] as [number, number])
      polylineRef.current = L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.9 }).addTo(map)
      map.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] })
    } else if (waypoints.length > 0) {
      map.setView([waypoints[0].lat, waypoints[0].lng], 14)
    }
  }, [waypoints, routeGeometry])

  return (
    <div
      ref={containerRef}
      data-testid="kakao-map"
      className="w-full h-full"
    />
  )
}
