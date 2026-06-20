'use client'

import { useRef, useEffect, useState } from 'react'
import type { ElevationPoint } from '@/lib/elevation'
import type { RoadType } from '@/lib/roadtype'

interface Props {
  points: ElevationPoint[]
  roadTypes?: RoadType[]
  waypointDists?: number[]  // 경유지가 위치한 누적 거리(m) 배열 (출발=0 제외, 도착 포함)
  hideTitle?: boolean
}

const COLOR: Record<RoadType, string> = {
  bike: '#22c55e',
  road: '#6b7280',
}

export default function ElevationChart({ points, roadTypes, waypointDists, hideTitle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartW, setChartW] = useState(320)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setChartW(el.offsetWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (points.length < 2) return null

  const H = 110
  const PAD = { top: 10, right: 8, bottom: 22, left: 40 }
  const innerW = chartW - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const elevations = points.map(p => p.elevation)
  const minElev = Math.min(...elevations)
  const maxElev = Math.max(...elevations)
  const maxDist = points[points.length - 1].distance
  const elevRange = maxElev - minElev || 1

  const toX = (d: number) => PAD.left + (d / maxDist) * innerW
  const toY = (e: number) => PAD.top + innerH - ((e - minElev) / elevRange) * innerH
  const bottomY = PAD.top + innerH

  // 포인트 간 구간을 사다리꼴로 색칠 (roadTypes[i] = points[i]~points[i+1] 사이 타입)
  const hasBike = roadTypes?.some(t => t === 'bike')
  const hasRoad = roadTypes?.some(t => t === 'road')

  // x축 km 눈금
  const totalKm = maxDist / 1000
  const kmStep = totalKm <= 2 ? 0.5 : totalKm <= 5 ? 1 : totalKm <= 10 ? 2 : totalKm <= 20 ? 5 : 10
  const kmMarkers: number[] = []
  for (let km = 0; km <= totalKm + 0.001; km += kmStep) {
    kmMarkers.push(parseFloat(km.toFixed(1)))
  }

  // 고도 라인 전체 path
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`)
    .join('')

  return (
    <div ref={containerRef} className="px-3 pt-2 pb-2">
      {!hideTitle && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-xs font-medium">경로 요약</span>
          {roadTypes && (
            <div className="flex gap-3">
              {hasBike && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: COLOR.bike }} />
                  <span className="text-gray-500 text-xs">자전거도로</span>
                </div>
              )}
              {hasRoad && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: COLOR.road }} />
                  <span className="text-gray-500 text-xs">일반도로</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {hideTitle && roadTypes && (
        <div className="flex gap-3 mb-2">
          {hasBike && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: COLOR.bike }} />
              <span className="text-gray-500 text-xs">자전거도로</span>
            </div>
          )}
          {hasRoad && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: COLOR.road }} />
              <span className="text-gray-500 text-xs">일반도로</span>
            </div>
          )}
        </div>
      )}

      <svg width={chartW} height={H} style={{ display: 'block' }}>
        <defs>
          <clipPath id="chartArea">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH + 1} />
          </clipPath>
        </defs>

        {/* 구간별 사다리꼴 채움 */}
        {points.slice(0, -1).map((p, i) => {
          const p2 = points[i + 1]
          const type: RoadType = roadTypes?.[i] ?? 'road'
          const color = COLOR[type]
          const x1 = toX(p.distance)
          const y1 = toY(p.elevation)
          const x2 = toX(p2.distance)
          const y2 = toY(p2.elevation)
          const trapezoid = `M${x1.toFixed(1)},${bottomY.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${x2.toFixed(1)},${bottomY.toFixed(1)}Z`
          return (
            <path key={i} d={trapezoid} fill={color} opacity="0.35" clipPath="url(#chartArea)" />
          )
        })}

        {/* 경유지 세로 마커 */}
        {waypointDists?.map((dist, i) => {
          const x = toX(dist)
          if (x <= PAD.left || x >= PAD.left + innerW) return null
          const isLast = i === (waypointDists.length - 1)
          const label = isLast ? '도착' : `경유${i + 1}`
          return (
            <g key={i}>
              <line x1={x} y1={PAD.top} x2={x} y2={bottomY} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,2" opacity="0.6" />
              <text x={x + 3} y={PAD.top + 9} fill="#9ca3af" fontSize="8">{label}</text>
            </g>
          )
        })}

        {/* 고도 라인 */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" clipPath="url(#chartArea)" />

        {/* 축 */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={bottomY} stroke="#374151" strokeWidth="1" />
        <line x1={PAD.left} y1={bottomY} x2={PAD.left + innerW} y2={bottomY} stroke="#374151" strokeWidth="1" />

        {/* Y 라벨 */}
        <text x={PAD.left - 5} y={PAD.top + 5} textAnchor="end" fill="#9ca3af" fontSize="9">{Math.round(maxElev)}m</text>
        <text x={PAD.left - 5} y={bottomY} textAnchor="end" fill="#9ca3af" fontSize="9">{Math.round(minElev)}m</text>

        {/* X km 눈금 */}
        {kmMarkers.map((km, i) => {
          const x = toX(km * 1000)
          if (x > PAD.left + innerW + 4) return null
          return (
            <g key={i}>
              <line x1={x} y1={bottomY} x2={x} y2={bottomY + 3} stroke="#4b5563" strokeWidth="1" />
              <text
                x={x} y={H - 4}
                textAnchor={i === 0 ? 'start' : 'middle'}
                fill="#6b7280" fontSize="9"
              >
                {km === 0 ? '0' : `${km}km`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
