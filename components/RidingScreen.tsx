'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import type { Coordinate } from '@/lib/osrm'
import type { ElevationPoint } from '@/lib/elevation'

function haversineDist(a: Coordinate, b: Coordinate): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function closestRouteIndex(pos: Coordinate, geometry: Coordinate[]): number {
  let minDist = Infinity, idx = 0
  for (let i = 0; i < geometry.length; i++) {
    const d = haversineDist(pos, geometry[i])
    if (d < minDist) { minDist = d; idx = i }
  }
  return idx
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}분 ${String(s).padStart(2, '0')}초`
}

// 3단계 위치 버튼 아이콘
function LocationIcon({ mode }: { mode: 'free' | 'follow' | 'heading' }) {
  if (mode === 'free') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke="#64748b" strokeWidth="2"/>
        <circle cx="12" cy="12" r="3" fill="#64748b"/>
        <line x1="12" y1="2" x2="12" y2="6" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="18" x2="12" y2="22" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
        <line x1="2" y1="12" x2="6" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
        <line x1="18" y1="12" x2="22" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  }
  if (mode === 'follow') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke="#3b82f6" strokeWidth="2"/>
        <circle cx="12" cy="12" r="4" fill="#3b82f6"/>
        <line x1="12" y1="2" x2="12" y2="6" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="18" x2="12" y2="22" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="2" y1="12" x2="6" y2="12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
        <line x1="18" y1="12" x2="22" y2="12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  }
  // heading — 동심원 + 북쪽 향한 부채꼴
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12,12 L8,5 A8,8,0,0,1,16,5 Z" fill="#3b82f6" opacity="0.75"/>
      <circle cx="12" cy="12" r="8" stroke="#3b82f6" strokeWidth="2"/>
      <circle cx="12" cy="12" r="3.5" fill="#3b82f6"/>
      <circle cx="12" cy="12" r="1.5" fill="#fff"/>
    </svg>
  )
}

type LocationMode = 'free' | 'follow' | 'heading'

interface Props {
  geometry: Coordinate[]
  elevationPoints: ElevationPoint[]
  totalDistance: number
  onClose: () => void
}

export default function RidingScreen({ geometry, elevationPoints, totalDistance, onClose }: Props) {
  const outerMapRef = useRef<HTMLDivElement>(null)   // 클리핑 컨테이너
  const mapContainerRef = useRef<HTMLDivElement>(null) // 실제 Leaflet 컨테이너 (확장됨)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const currentMarkerRef = useRef<any>(null)
  const donePolyRef = useRef<any>(null)
  const remainPolyRef = useRef<any>(null)
  const watchIdRef = useRef<string | null>(null)
  const lastPosRef = useRef<Coordinate | null>(null)
  const lastAltRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const locationModeRef = useRef<LocationMode>('follow')
  const compassHeadingRef = useRef(0)

  const [elapsed, setElapsed] = useState(0)
  const [traveledDist, setTraveledDist] = useState(0)
  const [elevGain, setElevGain] = useState(0)
  const [closestIdx, setClosestIdx] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [locationMode, setLocationMode] = useState<LocationMode>('follow')

  // ─── Leaflet 지도 초기화 ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!mapContainerRef.current || mapRef.current) return
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as any)
      if (cancelled || !mapContainerRef.current) return
      LRef.current = L

      const map = L.map(mapContainerRef.current, {
        center: [37.5665, 126.978],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      // 수동 드래그 시 → free 모드
      map.on('dragstart', () => {
        locationModeRef.current = 'free'
        setLocationMode('free')
        // 컴퍼스 회전 해제
        if (mapContainerRef.current) {
          mapContainerRef.current.style.transform = ''
          mapContainerRef.current.style.transition = ''
        }
      })

      if (geometry.length > 1) {
        const latlngs = geometry.map(c => [c.lat, c.lng] as [number, number])
        remainPolyRef.current = L.polyline(latlngs, { color: '#94a3b8', weight: 5, opacity: 0.7 }).addTo(map)
        donePolyRef.current = L.polyline([], { color: '#22c55e', weight: 5, opacity: 1 }).addTo(map)
      }

      mapRef.current = map
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 1초 타이머 ──────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // ─── GPS 추적 ─────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    async function startWatch() {
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000 },
          (pos, err) => {
            if (!active || err || !pos) return
            const coord: Coordinate = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            const alt = pos.coords.altitude ?? null

            if (lastPosRef.current) {
              const d = haversineDist(lastPosRef.current, coord)
              if (d > 3 && d < 200) setTraveledDist(prev => prev + d)
            }
            lastPosRef.current = coord

            if (alt !== null) {
              if (lastAltRef.current !== null && alt - lastAltRef.current > 1) {
                setElevGain(prev => prev + (alt - lastAltRef.current!))
              }
              lastAltRef.current = alt
            }

            const idx = closestRouteIndex(coord, geometry)
            setClosestIdx(idx)

            const L = LRef.current, map = mapRef.current
            if (!L || !map) return

            if (currentMarkerRef.current) {
              currentMarkerRef.current.setLatLng([coord.lat, coord.lng])
            } else {
              const icon = L.divIcon({
                html: '<div style="width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.8)"></div>',
                className: '', iconSize: [16, 16], iconAnchor: [8, 8],
              })
              currentMarkerRef.current = L.marker([coord.lat, coord.lng], { icon, zIndexOffset: 1000 }).addTo(map)
            }

            const done = geometry.slice(0, idx + 1).map(c => [c.lat, c.lng] as [number, number])
            const remain = geometry.slice(idx).map(c => [c.lat, c.lng] as [number, number])
            donePolyRef.current?.setLatLngs(done)
            remainPolyRef.current?.setLatLngs(remain)

            const mode = locationModeRef.current
            if (mode === 'follow' || mode === 'heading') {
              map.panTo([coord.lat, coord.lng], { animate: true, duration: 0.5 })
            }
          }
        )
        watchIdRef.current = id
      } catch {}
    }
    startWatch()
    return () => {
      active = false
      if (watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
        watchIdRef.current = null
      }
    }
  }, [geometry])

  // ─── 나침반 (DeviceOrientation) ──────────────────────────────
  useEffect(() => {
    if (locationMode !== 'heading') {
      // 회전 초기화
      if (mapContainerRef.current) {
        mapContainerRef.current.style.transition = 'transform 0.4s ease'
        mapContainerRef.current.style.transform = 'rotate(0deg)'
        setTimeout(() => {
          if (mapContainerRef.current) mapContainerRef.current.style.transition = ''
        }, 400)
      }
      return
    }

    const handler = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading: iOS, 0=북, 90=동 (시계방향)
      const heading: number = (e as any).webkitCompassHeading ?? (360 - (e.alpha ?? 0))
      compassHeadingRef.current = heading
      if (mapContainerRef.current) {
        mapContainerRef.current.style.transform = `rotate(${-heading}deg)`
      }
    }

    const listen = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const perm = await (DeviceOrientationEvent as any).requestPermission()
          if (perm === 'granted') window.addEventListener('deviceorientation', handler, true)
        } catch {}
      } else {
        window.addEventListener('deviceorientation', handler, true)
      }
    }
    listen()

    return () => window.removeEventListener('deviceorientation', handler, true)
  }, [locationMode])

  // ─── 위치 버튼 핸들러 ─────────────────────────────────────────
  const handleLocationButton = useCallback(() => {
    const current = locationModeRef.current
    if (current === 'free') {
      // free → follow
      locationModeRef.current = 'follow'
      setLocationMode('follow')
      if (mapRef.current && lastPosRef.current) {
        mapRef.current.panTo([lastPosRef.current.lat, lastPosRef.current.lng], { animate: true })
      }
    } else if (current === 'follow') {
      // follow → heading
      locationModeRef.current = 'heading'
      setLocationMode('heading')
    } else {
      // heading → follow (북쪽 고정으로 복귀)
      locationModeRef.current = 'follow'
      setLocationMode('follow')
    }
  }, [])

  const handleConfirmEnd = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (watchIdRef.current) {
      Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
      watchIdRef.current = null
    }
    onClose()
  }, [onClose])

  const progress = geometry.length > 1 ? closestIdx / (geometry.length - 1) : 0
  const traveledKm = (traveledDist / 1000).toFixed(2)
  const totalKm = (totalDistance / 1000).toFixed(1)
  const remainKm = Math.max(0, totalDistance - traveledDist) / 1000
  const maxElevDist = elevationPoints.length > 0 ? elevationPoints[elevationPoints.length - 1].distance : 0
  const splitDist = maxElevDist * progress

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', flexDirection: 'column',
      background: '#000', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top)',
    }}>

      {/* ── 지도 영역 ── */}
      {/* 외부 클리핑 div: 화면에 보이는 영역만 잘라냄 */}
      <div ref={outerMapRef} style={{
        flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
      }}>
        {/* 내부 Leaflet 컨테이너: 30% 확장하여 회전 시 빈 모서리 방지 */}
        <div ref={mapContainerRef} style={{
          position: 'absolute',
          top: '-30%', left: '-30%',
          width: '160%', height: '160%',
          transformOrigin: '50% 50%',
          willChange: 'transform',
        }} />

        {/* 위치 모드 버튼 */}
        <button
          onClick={handleLocationButton}
          style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
            background: 'rgba(15,23,42,0.92)', border: '1px solid #334155',
            borderRadius: '50%', width: 42, height: 42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
          }}
        >
          <LocationIcon mode={locationMode} />
        </button>

        {/* 나침반 모드일 때 북쪽 방향 표시 */}
        {locationMode === 'heading' && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: 'rgba(15,23,42,0.85)', border: '1px solid #334155',
            borderRadius: 8, padding: '4px 8px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <polygon points="6,0 8,8 6,6 4,8" fill="#ef4444"/>
              <polygon points="6,12 8,4 6,6 4,4" fill="#64748b"/>
            </svg>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>나침반</span>
          </div>
        )}
      </div>

      {/* ── 하단 패널 ── */}
      <div style={{
        flexShrink: 0, background: 'rgba(10,15,30,0.98)',
        borderTop: '1px solid #1e293b', overflow: 'hidden',
      }}>
        {elevationPoints.length >= 2 && (
          <ElevationStrip points={elevationPoints} splitDist={splitDist} elevGain={Math.round(elevGain)} />
        )}

        <div style={{ height: 1, background: '#1e293b', margin: '0 12px' }} />

        <div style={{ display: 'flex', padding: '8px 8px 6px' }}>
          <StatItem main={traveledKm} unit="km" sub={`총 ${totalKm}km`} label="이동 거리" />
          <StatItem main={formatTime(elapsed)} unit="" sub={remainKm > 0.05 ? `${remainKm.toFixed(1)}km 남음` : '도착!'} label="라이딩 시간" />
          <StatItem main={`+${Math.round(elevGain)}`} unit="m" sub="획득 고도" label="고도" last />
        </div>

        <div style={{ padding: '0 12px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%', padding: '13px',
              background: '#dc2626', color: '#fff',
              fontWeight: 700, fontSize: 15,
              borderRadius: 14, border: 'none', cursor: 'pointer', display: 'block',
            }}
          >
            🏁 라이딩 종료
          </button>
        </div>
      </div>

      {/* ── 종료 확인 다이얼로그 ── */}
      {showConfirm && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 4000, padding: '0 24px',
        }}>
          <div style={{ background: '#1e293b', borderRadius: 20, padding: 24, width: '100%', maxWidth: 300 }}>
            <div style={{ color: '#fff', fontWeight: 700, textAlign: 'center', fontSize: 16, marginBottom: 8 }}>
              라이딩 종료
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              {traveledKm}km · {formatTime(elapsed)}<br />라이딩을 종료하시겠어요?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: '12px', background: '#334155', color: '#cbd5e1', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >계속하기</button>
              <button
                onClick={handleConfirmEnd}
                style={{ flex: 1, padding: '12px', background: '#dc2626', color: '#fff', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >종료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────

function StatItem({ main, unit, sub, label, last }: {
  main: string; unit: string; sub: string; label: string; last?: boolean
}) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 4px', borderRight: last ? 'none' : '1px solid #1e293b' }}>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.1 }}>
        {main}{unit && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>{sub}</div>
      <div style={{ color: '#334155', fontSize: 10, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function ElevationStrip({ points, splitDist, elevGain }: {
  points: ElevationPoint[]; splitDist: number; elevGain: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(el.offsetWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 44
  const PAD = { top: 4, right: 10, bottom: 16, left: 10 }
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  if (innerW <= 0 || points.length < 2) return null

  const elevs = points.map(p => p.elevation)
  const minE = Math.min(...elevs), maxE = Math.max(...elevs)
  const maxD = points[points.length - 1].distance
  const eRange = maxE - minE || 1
  const toX = (d: number) => PAD.left + (d / maxD) * innerW
  const toY = (e: number) => PAD.top + innerH - ((e - minE) / eRange) * innerH
  const botY = PAD.top + innerH
  const splitX = toX(splitDist)
  const uid = `es${Math.round(width)}`

  const area = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`
  ).join('') + ` L${toX(maxD).toFixed(1)},${botY.toFixed(1)} L${PAD.left},${botY.toFixed(1)}Z`

  const closestPoint = points.reduce((c, p) => p.distance <= splitDist ? p : c, points[0])

  return (
    <div ref={containerRef} style={{ padding: '8px 12px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: '#475569' }}>고도 프로필</span>
        {elevGain > 0 && <span style={{ fontSize: 9, color: '#22c55e' }}>+{elevGain}m 획득</span>}
      </div>
      <svg width={width - 24} height={H} style={{ display: 'block' }}>
        <defs>
          <clipPath id={`d-${uid}`}><rect x={0} y={0} width={splitX} height={H} /></clipPath>
          <clipPath id={`r-${uid}`}><rect x={splitX} y={0} width={width} height={H} /></clipPath>
        </defs>
        <path d={area} fill="#22c55e" opacity="0.5" clipPath={`url(#d-${uid})`} />
        <path d={area} fill="#334155" opacity="0.5" clipPath={`url(#r-${uid})`} />
        <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`).join('')}
          fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" />
        {splitDist > 0 && (
          <>
            <line x1={splitX} y1={PAD.top} x2={splitX} y2={botY} stroke="#3b82f6" strokeWidth="2" />
            <circle cx={splitX} cy={toY(closestPoint.elevation)} r="3.5" fill="#3b82f6" />
          </>
        )}
        <line x1={PAD.left} y1={botY} x2={PAD.left + innerW} y2={botY} stroke="#1e293b" strokeWidth="1" />
        <text x={PAD.left} y={H} fill="#475569" fontSize="8" textAnchor="start">0</text>
        <text x={PAD.left + innerW} y={H} fill="#475569" fontSize="8" textAnchor="end">{(maxD / 1000).toFixed(1)}km</text>
      </svg>
    </div>
  )
}
