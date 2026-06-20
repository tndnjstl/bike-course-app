'use client'

import { buildKakaoMapUrl, buildNaverMapUrl, openMapApp } from '@/lib/kakao-scheme'
import { extractWaypoints, formatDistance, formatDuration } from '@/lib/osrm'
import type { Coordinate } from '@/lib/osrm'

interface Props {
  geometry: Coordinate[]
  distance: number
  duration: number
  onClose: () => void
}

export default function ShareModal({ geometry, distance, duration, onClose }: Props) {
  const waypoints = extractWaypoints(geometry, 5)

  const handleKakao = () => {
    const url = buildKakaoMapUrl(waypoints)
    if (!url) return
    openMapApp(url, 'kakao')
  }

  const handleNaver = () => {
    const url = buildNaverMapUrl(waypoints)
    if (!url) return
    openMapApp(url, 'naver')
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div
        className="w-full bg-gray-900 rounded-t-2xl p-6"
        onClick={e => e.stopPropagation()}
        data-testid="share-modal"
      >
        <div className="w-10 h-1 bg-gray-700 rounded mx-auto mb-5" />

        <h2 className="text-white font-bold text-lg mb-1">안내 시작</h2>
        <p className="text-gray-400 text-sm mb-5">열 지도 앱을 선택하세요</p>

        {/* 코스 요약 */}
        <div className="flex gap-4 mb-6 bg-gray-800 rounded-xl p-4">
          <div className="text-center flex-1">
            <div className="text-green-400 font-bold text-lg">{formatDistance(distance)}</div>
            <div className="text-gray-500 text-xs mt-0.5">총 거리</div>
          </div>
          <div className="w-px bg-gray-700" />
          <div className="text-center flex-1">
            <div className="text-green-400 font-bold text-lg">{formatDuration(duration)}</div>
            <div className="text-gray-500 text-xs mt-0.5">예상 시간</div>
          </div>
          <div className="w-px bg-gray-700" />
          <div className="text-center flex-1">
            <div className="text-green-400 font-bold text-lg">{waypoints.length}개</div>
            <div className="text-gray-500 text-xs mt-0.5">경유지</div>
          </div>
        </div>

        {/* 앱 선택 */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleKakao}
            data-testid="btn-kakao"
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-xl transition-colors"
          >
            🗺️ 카카오맵
          </button>
          <button
            onClick={handleNaver}
            data-testid="btn-naver"
            className="flex-1 bg-green-500 hover:bg-green-400 text-white font-bold py-4 rounded-xl transition-colors"
          >
            🗺️ 네이버지도
          </button>
        </div>

        <p className="text-gray-600 text-xs text-center">앱 미설치 시 스토어로 이동합니다</p>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 text-gray-500 text-sm"
        >
          취소
        </button>
      </div>
    </div>
  )
}
