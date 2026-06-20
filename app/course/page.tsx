'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import ShareModal from '@/components/ShareModal'
import { calcBikeRoute, formatDistance, formatDuration, guessStepType } from '@/lib/osrm'
import type { Coordinate, RouteResult, RouteStep } from '@/lib/osrm'
import { saveCourse } from '@/lib/storage'
import { fetchElevationProfile, calcElevationStats, type ElevationPoint } from '@/lib/elevation'
import { classifyRoutePoints, type RoadType } from '@/lib/roadtype'
import type { RouteSegment } from '@/components/KakaoMap'

// roadTypes(30점) → 전체 geometry에 매핑해 색상 구간 분리
function buildSegments(geometry: Coordinate[], roadTypes: RoadType[]): RouteSegment[] {
  if (!geometry.length || !roadTypes.length) return []
  const m = roadTypes.length
  const segments: RouteSegment[] = []
  let curType = roadTypes[0]
  let curCoords: Coordinate[] = [geometry[0]]

  for (let i = 1; i < geometry.length; i++) {
    const idx = Math.min(Math.round((i / (geometry.length - 1)) * (m - 1)), m - 1)
    const type = roadTypes[idx]
    if (type !== curType) {
      curCoords.push(geometry[i])
      segments.push({ coords: curCoords, type: curType })
      curType = type
      curCoords = [geometry[i]]
    } else {
      curCoords.push(geometry[i])
    }
  }
  if (curCoords.length > 1) segments.push({ coords: curCoords, type: curType })
  return segments
}

const KakaoMap = dynamic(() => import('@/components/KakaoMap'), { ssr: false })
const ElevationChart = dynamic(() => import('@/components/ElevationChart'), { ssr: false })

interface Place {
  name: string
  address: string
  coord: Coordinate
}

interface Slot {
  id: string
  name: string
  coord: Coordinate | null
}

let _id = 0
const newSlot = (): Slot => ({ id: `s${++_id}`, name: '', coord: null })

type CourseOption = 'bike' | 'flat' | 'shortest'

const OPTION_LABELS: Record<CourseOption, string> = {
  bike: '🚲 자전거도로',
  flat: '🏞️ 평지 우선',
  shortest: '⚡ 최단거리',
}

async function searchPlaces(q: string): Promise<Place[]> {
  if (!q.trim()) return []
  if (typeof window !== 'undefined' && (window as any).kakao?.maps?.services) {
    return new Promise(resolve => {
      const ps = new (window as any).kakao.maps.services.Places()
      ps.keywordSearch(q, (data: any[], status: string) => {
        if (status !== (window as any).kakao.maps.services.Status.OK) { resolve([]); return }
        resolve(data.slice(0, 6).map((p: any) => ({
          name: p.place_name,
          address: p.road_address_name || p.address_name,
          coord: { lat: parseFloat(p.y), lng: parseFloat(p.x) },
        })))
      })
    })
  }
  const params = new URLSearchParams({ q, format: 'json', countrycodes: 'kr', limit: '6', 'accept-language': 'ko' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'BikeCourseApp/1.0' },
  })
  const data = await res.json()
  return data.map((item: any) => ({
    name: item.name || item.display_name.split(',')[0],
    address: item.display_name,
    coord: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
  }))
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
      { headers: { 'User-Agent': 'BikeCourseApp/1.0' } }
    )
    const data = await res.json()
    return data.name || data.display_name?.split(',')[0] || '현재 위치'
  } catch {
    return '현재 위치'
  }
}

function RouteSegmentList({ steps }: { steps: RouteStep[] }) {
  if (!steps.length) return null

  // 연속된 동일 타입+이름 구간 병합
  const merged: { name: string; distance: number; type: 'bike' | 'road' | 'push' }[] = []
  for (const step of steps) {
    const type = guessStepType(step)
    const name = step.name || (type === 'bike' ? '자전거도로' : '도로')
    const last = merged[merged.length - 1]
    if (last && last.type === type && last.name === name) {
      last.distance += step.distance
    } else {
      merged.push({ name, distance: step.distance, type })
    }
  }

  const typeLabel: Record<string, string> = { bike: '자전거도로', road: '일반도로', push: '도보 구간' }
  const typeColor: Record<string, string> = { bike: '#22c55e', road: '#6b7280', push: '#f59e0b' }

  return (
    <div className="mt-3 bg-gray-800 rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-gray-400 text-xs font-medium border-b border-gray-700/60">경로 구간</div>
      {merged.map((seg, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-700/40 last:border-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: typeColor[seg.type] }} />
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs truncate">{seg.name}</div>
            <div className="text-xs mt-0.5" style={{ color: typeColor[seg.type] }}>{typeLabel[seg.type]}</div>
          </div>
          <div className="text-gray-400 text-xs flex-shrink-0 font-medium">{formatDistance(seg.distance)}</div>
        </div>
      ))}
    </div>
  )
}

export default function CoursePage() {
  const [slots, setSlots] = useState<Slot[]>([newSlot(), newSlot()])
  const [option, setOption] = useState<CourseOption>('bike')
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showShare, setShowShare] = useState(false)

  const [elevationPoints, setElevationPoints] = useState<ElevationPoint[] | null>(null)
  const [roadTypes, setRoadTypes] = useState<RoadType[] | null>(null)
  const [elevLoading, setElevLoading] = useState(false)
  const [elevError, setElevError] = useState(false)

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)

  // 검색 오버레이
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Place[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastElevGeomKeyRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 경로가 바뀌면 고도 + 도로타입 분류 병렬 실행
  useEffect(() => {
    if (!route?.geometry?.length) {
      setElevationPoints(null)
      setRoadTypes(null)
      lastElevGeomKeyRef.current = null
      return
    }
    const g = route.geometry
    const key = `${g[0].lat},${g[0].lng},${g[g.length - 1].lat},${g[g.length - 1].lng},${g.length}`
    if (key === lastElevGeomKeyRef.current) return
    lastElevGeomKeyRef.current = key
    setElevLoading(true)
    setElevError(false)
    setRoadTypes(null)
    Promise.all([
      fetchElevationProfile(g),
      classifyRoutePoints(g),
    ])
      .then(([pts, types]) => {
        setElevationPoints(pts)
        setRoadTypes(types)
      })
      .catch(() => setElevError(true))
      .finally(() => setElevLoading(false))
  }, [route])

  // 검색창 열리면 포커스
  useEffect(() => {
    if (activeSlotId) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [activeSlotId])

  const runRoute = useCallback(async (updatedSlots: Slot[]) => {
    const filled = updatedSlots.filter(s => s.coord !== null)
    if (filled.length < 2) { setRoute(null); return }
    setLoading(true)
    setElevationPoints(null)
    setRoadTypes(null)
    setElevError(false)
    lastElevGeomKeyRef.current = null
    const result = await calcBikeRoute(filled.map(s => s.coord!))
    setRoute(result)
    setLoading(false)
  }, [])

  const openSearch = (slotId: string) => {
    setActiveSlotId(slotId)
    setSearchQuery('')
    setSearchResults([])
  }

  const closeSearch = () => {
    setActiveSlotId(null)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleSearchInput = (val: string) => {
    setSearchQuery(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!val.trim()) { setSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      setSearchResults(await searchPlaces(val))
      setSearchLoading(false)
    }, 400)
  }

  const selectPlace = useCallback((place: Place) => {
    if (!activeSlotId) return
    setSlots(prev => {
      const next = prev.map(s => s.id === activeSlotId ? { ...s, name: place.name, coord: place.coord } : s)
      runRoute(next)
      return next
    })
    setSaved(false)
    closeSearch()
  }, [activeSlotId, runRoute])

  const clearSlot = useCallback((id: string) => {
    setSlots(prev => {
      const next = prev.map(s => s.id === id ? { ...s, name: '', coord: null } : s)
      runRoute(next)
      return next
    })
    setSaved(false)
  }, [runRoute])

  const addVia = () => {
    setSlots(prev => {
      const next = [...prev]
      next.splice(prev.length - 1, 0, newSlot())
      return next
    })
  }

  const removeSlot = useCallback((id: string) => {
    setSlots(prev => {
      if (prev.length <= 2) return prev
      const next = prev.filter(s => s.id !== id)
      runRoute(next)
      return next
    })
    setSaved(false)
  }, [runRoute])

  const handleDragStart = (i: number) => setDragIndex(i)
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIndex(i) }
  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); setDragOverIndex(null); return }
    setSlots(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      runRoute(next)
      return next
    })
    setSaved(false)
    setDragIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  const getGpsLocation = useCallback((slotId: string) => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const name = await reverseGeocode(lat, lng)
        setSlots(prev => {
          const next = prev.map(s => s.id === slotId ? { ...s, name, coord: { lat, lng } } : s)
          runRoute(next)
          return next
        })
        setSaved(false)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [runRoute])

  const changeOption = async (opt: CourseOption) => {
    setOption(opt)
    const filled = slots.filter(s => s.coord !== null)
    if (filled.length >= 2) {
      setLoading(true)
      setElevationPoints(null)
      setRoadTypes(null)
      lastElevGeomKeyRef.current = null
      const profile = opt === 'shortest' ? 'foot' : 'bike'
      const result = await calcBikeRoute(filled.map(s => s.coord!), profile)
      setRoute(result)
      setLoading(false)
    }
  }

  const confirmSave = () => {
    if (!route) return
    const filled = slots.filter(s => s.coord !== null)
    saveCourse({
      name: saveName || filled.map(s => s.name).join(' → '),
      waypoints: filled.map(s => ({ name: s.name, coord: s.coord! })),
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
    })
    setShowSaveDialog(false)
    setSaved(true)
  }

  const elevStats = elevationPoints ? calcElevationStats(elevationPoints) : null
  const filledSlots = slots.filter(s => s.coord !== null)

  const dotColor = (i: number) => {
    if (i === 0) return '#16a34a'
    if (i === slots.length - 1) return '#dc2626'
    return '#2563eb'
  }

  const slotLabel = (i: number) => {
    if (i === 0) return '출발'
    if (i === slots.length - 1) return '도착'
    return `경유${i}`
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
        <Link href="/" className="text-gray-400 hover:text-white text-lg">←</Link>
        <h1 className="text-white font-bold">코스 설계</h1>
        {saved && <span className="ml-auto text-green-400 text-xs">저장됨 ✓</span>}
      </div>

      {/* 지도 */}
      <div className="flex-1 relative min-h-0">
        <KakaoMap
          waypoints={filledSlots.map(s => s.coord!)}
          routeGeometry={route?.geometry ?? []}
          routeSegments={route && roadTypes ? buildSegments(route.geometry, roadTypes) : undefined}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="bg-gray-900 rounded-xl px-5 py-3 text-white text-sm">경로 계산 중...</div>
          </div>
        )}
      </div>

      {/* 하단 패널 */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 pt-4 pb-6 max-h-[55vh] overflow-y-auto">

        {/* 출발/경유/도착 슬롯 */}
        <div className="mb-2">
          {slots.map((slot, i) => {
            const isFirst = i === 0
            const isLast = i === slots.length - 1
            const isMiddle = !isFirst && !isLast
            const isDragging = dragIndex === i
            const isOver = dragOverIndex === i && dragIndex !== i

            return (
              <div
                key={slot.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                className={`flex items-stretch gap-3 transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'} ${isOver ? 'bg-gray-800/50 rounded-xl' : ''}`}
              >
                {/* 도트 + 연결선 */}
                <div className="flex flex-col items-center flex-shrink-0 pt-3.5">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor(i) }}
                  />
                  {!isLast && (
                    <div className="w-px flex-1 bg-gray-700 my-1" style={{ minHeight: 12 }} />
                  )}
                </div>

                {/* 입력 행 */}
                <div className={`flex-1 flex items-center gap-2 ${isLast ? '' : 'pb-1'}`}>
                  <button
                    onClick={() => openSearch(slot.id)}
                    className="flex-1 flex items-center gap-2 bg-gray-800 hover:bg-gray-750 rounded-xl px-3 py-2.5 text-left min-w-0"
                  >
                    <span className="text-gray-500 text-xs flex-shrink-0 w-8">{slotLabel(i)}</span>
                    <span className={`flex-1 text-sm truncate ${slot.name ? 'text-white' : 'text-gray-600'}`}>
                      {slot.name || '장소 검색...'}
                    </span>
                  </button>

                  {/* 출발 → GPS 버튼 */}
                  {isFirst && (
                    <button
                      onClick={() => getGpsLocation(slot.id)}
                      className="flex-shrink-0 w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center justify-center"
                      title="현재 위치"
                    >
                      <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                        <circle cx="11" cy="11" r="9" stroke="#9ca3af" strokeWidth="1.5" />
                        <circle cx="11" cy="11" r="5" stroke="#9ca3af" strokeWidth="1.5" />
                        <circle cx="11" cy="11" r="2.5" fill="#16a34a" />
                        <line x1="11" y1="1" x2="11" y2="4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="11" y1="18" x2="11" y2="21" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="1" y1="11" x2="4" y2="11" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="18" y1="11" x2="21" y2="11" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}

                  {/* 경유지 → X 삭제 */}
                  {isMiddle && (
                    <button
                      onClick={() => removeSlot(slot.id)}
                      className="flex-shrink-0 w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-400 text-lg"
                    >
                      ×
                    </button>
                  )}

                  {/* 도착 → 입력됐으면 X */}
                  {isLast && slot.coord && (
                    <button
                      onClick={() => clearSlot(slot.id)}
                      className="flex-shrink-0 w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-400 text-lg"
                    >
                      ×
                    </button>
                  )}

                  {/* 드래그 핸들 */}
                  <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 touch-none">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="4" cy="3" r="1.2" fill="currentColor" />
                      <circle cx="4" cy="7" r="1.2" fill="currentColor" />
                      <circle cx="4" cy="11" r="1.2" fill="currentColor" />
                      <circle cx="10" cy="3" r="1.2" fill="currentColor" />
                      <circle cx="10" cy="7" r="1.2" fill="currentColor" />
                      <circle cx="10" cy="11" r="1.2" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 경유지 추가 */}
        <button
          onClick={addVia}
          className="w-full border border-dashed border-gray-700 hover:border-green-600 rounded-xl text-gray-500 hover:text-green-400 text-sm py-2 mb-3 transition-colors"
        >
          + 경유지 추가
        </button>

        {/* 코스 옵션 */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {(Object.keys(OPTION_LABELS) as CourseOption[]).map(opt => (
            <button
              key={opt}
              onClick={() => changeOption(opt)}
              data-testid={`option-${opt}`}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                option === opt
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {OPTION_LABELS[opt]}
            </button>
          ))}
        </div>

        {/* 코스 결과 */}
        {loading && (
          /* 경로 계산 중 스켈레톤 */
          <div className="bg-gray-800 rounded-xl px-4 py-3 animate-pulse">
            <div className="flex gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="h-6 w-14 bg-gray-700 rounded" />
                  <div className="h-3 w-10 bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {route && !loading && (
          <>
            <div data-testid="route-result" className="bg-gray-800 rounded-xl px-4 py-3">
              <div className="flex gap-4">
                <div className="text-center flex-1">
                  <div className="text-green-400 font-bold">{formatDistance(route.distance)}</div>
                  <div className="text-gray-500 text-xs">거리</div>
                </div>
                <div className="w-px bg-gray-700" />
                <div className="text-center flex-1">
                  <div className="text-green-400 font-bold">{formatDuration(route.duration)}</div>
                  <div className="text-gray-500 text-xs">예상시간</div>
                </div>
                {elevLoading ? (
                  <>
                    <div className="w-px bg-gray-700" />
                    <div className="flex-1 flex flex-col items-center gap-1.5 animate-pulse">
                      <div className="h-5 w-12 bg-gray-700 rounded" />
                      <div className="h-3 w-10 bg-gray-700 rounded" />
                    </div>
                  </>
                ) : elevStats ? (
                  <>
                    <div className="w-px bg-gray-700" />
                    <div className="text-center flex-1">
                      <div className="text-green-400 font-bold">↑{elevStats.totalAscent}m</div>
                      <div className="text-gray-500 text-xs">총 오르막</div>
                    </div>
                  </>
                ) : null}
              </div>
              {/* 구간별 거리 (경유지 있을 때) */}
              {route.legs.length > 1 && (
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  {route.legs.map((leg, i) => {
                    const labels = slots.filter(s => s.coord !== null).map((s, idx) =>
                      idx === 0 ? '출발' : idx === filledSlots.length - 1 ? '도착' : `경유${idx}`
                    )
                    return (
                      <div key={i} className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500">{labels[i] ?? `경유${i}`}</span>
                        <span className="text-gray-600">→</span>
                        <span className="text-gray-500">{labels[i + 1] ?? '도착'}</span>
                        <span className="text-white font-medium ml-1">{formatDistance(leg.distance)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {elevError && (
                <div className="mt-3 text-center text-xs text-red-500">고도 데이터를 불러올 수 없어요</div>
              )}
            </div>

            {/* 고도 차트: 로딩 중엔 스켈레톤 */}
            {(() => {
              // 경유지 누적 거리 계산 (경유1, 경유2, ..., 도착)
              const waypointDists = route.legs.length > 1
                ? route.legs.reduce<number[]>((acc, leg, i) => {
                    const prev = acc[i - 1] ?? 0
                    acc.push(prev + leg.distance)
                    return acc
                  }, [])
                : undefined
              return elevLoading ? (
                <div className="bg-gray-800 rounded-xl px-3 pt-3 pb-2 mt-3 animate-pulse">
                  <div className="h-3 w-20 bg-gray-700 rounded mb-3" />
                  <div className="h-[110px] bg-gray-700 rounded" />
                </div>
              ) : elevationPoints ? (
                <ElevationChart
                  points={elevationPoints}
                  roadTypes={roadTypes ?? undefined}
                  waypointDists={waypointDists}
                />
              ) : null
            })()}

            {route.steps.length > 0 && <RouteSegmentList steps={route.steps} />}
          </>
        )}

        {/* 버튼 행 */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => {
              if (!route) return
              setSaveName(filledSlots.map(s => s.name).join(' → '))
              setShowSaveDialog(true)
            }}
            disabled={!route}
            data-testid="btn-save"
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-700 text-gray-300 text-sm font-medium rounded-xl transition-colors"
          >
            💾 코스 저장
          </button>
          <button
            onClick={() => setShowShare(true)}
            disabled={!route}
            data-testid="btn-start-guide"
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold rounded-xl transition-colors"
          >
            {route ? '안내 시작 →' : '경유지 2개 이상'}
          </button>
        </div>
      </div>

      {/* 검색 오버레이 */}
      {activeSlotId && (
        <div className="fixed inset-0 bg-gray-950 z-[2000] flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
            <button onClick={closeSearch} className="text-gray-400 hover:text-white text-lg">←</button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="장소 검색..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            {searchLoading && <span className="text-gray-500 text-xs flex-shrink-0">검색 중</span>}
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchResults.length > 0 ? (
              <ul>
                {searchResults.map((r, i) => (
                  <li
                    key={i}
                    onClick={() => selectPlace(r)}
                    className="px-4 py-4 hover:bg-gray-800 cursor-pointer border-b border-gray-800 last:border-0"
                  >
                    <div className="text-white text-sm font-medium">{r.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5 truncate">{r.address}</div>
                  </li>
                ))}
              </ul>
            ) : searchQuery && !searchLoading ? (
              <div className="text-center text-gray-600 text-sm py-12">검색 결과가 없습니다</div>
            ) : (
              <div className="text-center text-gray-600 text-sm py-12">장소 이름을 입력하세요</div>
            )}
          </div>
        </div>
      )}

      {/* 공유 모달 */}
      {showShare && route && (
        <ShareModal
          geometry={route.geometry}
          distance={route.distance}
          duration={route.duration}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* 저장 다이얼로그 */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-white font-bold mb-4">코스 저장</h2>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="코스 이름"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-3 bg-gray-800 text-gray-400 rounded-xl text-sm"
              >
                취소
              </button>
              <button
                onClick={confirmSave}
                data-testid="btn-confirm-save"
                className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl text-sm"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
