'use client'

import type { ElevationPoint } from '@/lib/elevation'
import { formatDistance } from '@/lib/osrm'

interface Props {
  points: ElevationPoint[]
}

export default function ElevationChart({ points }: Props) {
  if (points.length < 2) return null

  const W = 300
  const H = 80
  const PAD = { top: 10, right: 8, bottom: 18, left: 36 }

  const elevations = points.map(p => p.elevation)
  const minElev = Math.min(...elevations)
  const maxElev = Math.max(...elevations)
  const maxDist = points[points.length - 1].distance

  const elevRange = maxElev - minElev || 1
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const toX = (d: number) => PAD.left + (d / maxDist) * innerW
  const toY = (e: number) => PAD.top + innerH - ((e - minElev) / elevRange) * innerH

  const pts = points.map(p => `${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`).join(' ')
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)} ${toY(p.elevation).toFixed(1)}`)
    .join('')
  const fillPath = `${linePath}L${toX(maxDist).toFixed(1)} ${(PAD.top + innerH).toFixed(1)}L${PAD.left} ${(PAD.top + innerH).toFixed(1)}Z`

  return (
    <div className="bg-gray-800 rounded-xl p-3 mt-3">
      <div className="text-gray-400 text-xs mb-1 font-medium">고도 프로필</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="#374151" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#374151" strokeWidth="1" />
        {/* fill */}
        <path d={fillPath} fill="url(#elevGrad)" />
        {/* line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" />
        {/* y labels */}
        <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fill="#9ca3af" fontSize="7">{Math.round(maxElev)}m</text>
        <text x={PAD.left - 4} y={PAD.top + innerH} textAnchor="end" fill="#9ca3af" fontSize="7">{Math.round(minElev)}m</text>
        {/* x labels */}
        <text x={PAD.left} y={H - 2} fill="#9ca3af" fontSize="7">0</text>
        <text x={W - PAD.right} y={H - 2} textAnchor="end" fill="#9ca3af" fontSize="7">{formatDistance(maxDist)}</text>
      </svg>
    </div>
  )
}
