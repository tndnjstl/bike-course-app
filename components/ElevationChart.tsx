'use client'

import { useRef, useEffect, useState } from 'react'
import type { ElevationPoint } from '@/lib/elevation'
import type { RouteStep } from '@/lib/osrm'
import { guessStepType } from '@/lib/osrm'

interface Props {
  points: ElevationPoint[]
  steps?: RouteStep[]
}

const TYPE_COLOR: Record<string, string> = {
  bike: '#22c55e',
  road: '#6b7280',
  push: '#f59e0b',
}

export default function ElevationChart({ points, steps }: Props) {
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

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)} ${toY(p.elevation).toFixed(1)}`)
    .join('')
  const bottomY = PAD.top + innerH
  const fillPath = `${linePath}L${(PAD.left + innerW).toFixed(1)} ${bottomY.toFixed(1)}L${PAD.left.toFixed(1)} ${bottomY.toFixed(1)}Z`

  // 구간별 x 범위 계산 (step 거리의 비율로)
  const segments: { x1: number; x2: number; color: string }[] = []
  if (steps && steps.length > 0) {
    const totalStepDist = steps.reduce((s, st) => s + st.distance, 0)
    let cum = 0
    for (const step of steps) {
      const color = TYPE_COLOR[guessStepType(step)] ?? TYPE_COLOR.road
      const x1 = PAD.left + (cum / totalStepDist) * innerW
      cum += step.distance
      const x2 = PAD.left + Math.min(cum / totalStepDist, 1) * innerW
      const last = segments[segments.length - 1]
      if (last && last.color === color) {
        last.x2 = x2
      } else {
        segments.push({ x1, x2, color })
      }
    }
  }

  // x축 km 눈금 (보기 좋은 간격)
  const totalKm = maxDist / 1000
  const kmStep = totalKm <= 2 ? 0.5 : totalKm <= 5 ? 1 : totalKm <= 10 ? 2 : totalKm <= 20 ? 5 : 10
  const kmMarkers: number[] = []
  for (let km = 0; km <= totalKm + 0.001; km += kmStep) {
    kmMarkers.push(parseFloat(km.toFixed(1)))
  }

  const hasSegments = segments.length > 0
  const hasBike = hasSegments && segments.some(s => s.color === TYPE_COLOR.bike)
  const hasRoad = hasSegments && segments.some(s => s.color === TYPE_COLOR.road)

  return (
    <div ref={containerRef} className="bg-gray-800 rounded-xl px-3 pt-3 pb-2 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs font-medium">고도 프로필</span>
        {hasSegments && (
          <div className="flex gap-3">
            {hasBike && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: TYPE_COLOR.bike, opacity: 0.75 }} />
                <span className="text-gray-500 text-xs">자전거도로</span>
              </div>
            )}
            {hasRoad && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: TYPE_COLOR.road, opacity: 0.75 }} />
                <span className="text-gray-500 text-xs">일반도로</span>
              </div>
            )}
          </div>
        )}
      </div>

      <svg width={chartW} height={H} style={{ display: 'block' }}>
        <defs>
          {hasSegments
            ? segments.map((seg, i) => (
                <linearGradient key={i} id={`seg${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seg.color} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={seg.color} stopOpacity="0.08" />
                </linearGradient>
              ))
            : (
              <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.06" />
              </linearGradient>
            )
          }
          <clipPath id="chartArea">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH + 1} />
          </clipPath>
          {hasSegments && segments.map((_, i) => (
            <clipPath key={i} id={`clip${i}`}>
              <rect x={segments[i].x1} y={PAD.top} width={segments[i].x2 - segments[i].x1} height={innerH + 1} />
            </clipPath>
          ))}
        </defs>

        {/* 구간 색상 채움 */}
        {hasSegments
          ? segments.map((seg, i) => (
              <path key={i} d={fillPath} fill={`url(#seg${i})`} clipPath={`url(#clip${i})`} />
            ))
          : <path d={fillPath} fill="url(#elevGrad)" clipPath="url(#chartArea)" />
        }

        {/* 고도선 */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" clipPath="url(#chartArea)" />

        {/* 축 */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="#374151" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#374151" strokeWidth="1" />

        {/* Y축 라벨 */}
        <text x={PAD.left - 5} y={PAD.top + 5} textAnchor="end" fill="#9ca3af" fontSize="9">{Math.round(maxElev)}m</text>
        <text x={PAD.left - 5} y={PAD.top + innerH} textAnchor="end" fill="#9ca3af" fontSize="9">{Math.round(minElev)}m</text>

        {/* X축 km 눈금 */}
        {kmMarkers.map((km, i) => {
          const x = toX(km * 1000)
          if (x > PAD.left + innerW + 4) return null
          return (
            <g key={i}>
              <line x1={x} y1={PAD.top + innerH} x2={x} y2={PAD.top + innerH + 3} stroke="#4b5563" strokeWidth="1" />
              <text x={x} y={H - 4} textAnchor={i === 0 ? 'start' : 'middle'} fill="#6b7280" fontSize="9">
                {km === 0 ? '0' : `${km}km`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
