'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import ShareModal from '@/components/ShareModal'
import { calcBikeRoute, formatDistance, formatDuration } from '@/lib/osrm'
import type { Coordinate } from '@/lib/osrm'
import type { AiWaypoint } from '@/app/api/ai-course/route'

const KakaoMap = dynamic(() => import('@/components/KakaoMap'), { ssr: false })

type Difficulty = 'easy' | 'medium' | 'hard'
type Stage = 'form' | 'loading' | 'result'

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '초급 (평지 위주)',
  medium: '중급 (약간의 오르막)',
  hard: '고급 (언덕/산)',
}

export default function AIPage() {
  const [stage, setStage] = useState<Stage>('form')
  const [startLocation, setStartLocation] = useState('')
  const [duration, setDuration] = useState(2)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [error, setError] = useState('')

  const [waypoints, setWaypoints] = useState<AiWaypoint[]>([])
  const [route, setRoute] = useState<{ geometry: Coordinate[]; distance: number; duration: number } | null>(null)
  const [showShare, setShowShare] = useState(false)

  const handleSubmit = async () => {
    if (!startLocation.trim()) { setError('출발지를 입력해주세요'); return }
    setError('')
    setStage('loading')

    try {
      const res = await fetch('/api/ai-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startLocation, duration, difficulty }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const wps: AiWaypoint[] = data.waypoints
      setWaypoints(wps)

      const coords = wps.map(w => ({ lat: w.lat, lng: w.lng }))
      const routeResult = await calcBikeRoute(coords)
      setRoute(routeResult)
      setStage('result')
    } catch (e: any) {
      setError(e.message || '코스 생성 중 오류가 발생했어요')
      setStage('form')
    }
  }

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🤖</div>
          <div className="text-white font-bold text-lg mb-2">AI가 코스를 생성 중이에요</div>
          <div className="text-gray-400 text-sm">잠시만 기다려주세요...</div>
        </div>
      </div>
    )
  }

  if (stage === 'result' && route) {
    return (
      <div className="h-screen flex flex-col bg-gray-950">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 bg-gray-900 border-b border-gray-800" style={{paddingTop: 'calc(0.75rem + env(safe-area-inset-top))', paddingBottom: '0.75rem'}}>
          <button onClick={() => { setStage('form'); setRoute(null) }} className="text-gray-400 hover:text-white text-lg">←</button>
          <h1 className="text-white font-bold">AI 추천 코스</h1>
          <span className="ml-auto text-xs text-purple-400 bg-purple-900/30 px-2 py-1 rounded-full">
            🤖 AI 생성
          </span>
        </div>

        {/* 지도 */}
        <div className="flex-1 relative min-h-0">
          <KakaoMap
            waypoints={waypoints.map(w => ({ lat: w.lat, lng: w.lng }))}
            routeGeometry={route.geometry}
          />
        </div>

        {/* 하단 패널 */}
        <div className="bg-gray-900 border-t border-gray-800 px-4 pt-4 pb-6">
          {/* 경유지 목록 */}
          <div className="mb-3 space-y-2 max-h-32 overflow-y-auto">
            {waypoints.map((wp, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-2">
                <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {i === 0 ? '출' : i === waypoints.length - 1 ? '착' : i}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{wp.name}</div>
                  {wp.description && <div className="text-gray-500 text-xs truncate">{wp.description}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* 코스 정보 */}
          <div data-testid="ai-route-result" className="flex gap-4 bg-gray-800 rounded-xl px-4 py-3 mb-4">
            <div className="text-center flex-1">
              <div className="text-green-400 font-bold">{formatDistance(route.distance)}</div>
              <div className="text-gray-500 text-xs">거리</div>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="text-center flex-1">
              <div className="text-green-400 font-bold">{formatDuration(route.duration)}</div>
              <div className="text-gray-500 text-xs">예상시간</div>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="text-center flex-1">
              <div className="text-green-400 font-bold">{DIFFICULTY_LABELS[difficulty].split(' ')[0]}</div>
              <div className="text-gray-500 text-xs">난이도</div>
            </div>
          </div>

          <button
            onClick={() => setShowShare(true)}
            data-testid="btn-ai-start-guide"
            className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl"
          >
            안내 시작 →
          </button>
        </div>

        {showShare && (
          <ShareModal
            geometry={route.geometry}
            distance={route.distance}
            duration={route.duration}
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 pb-8" style={{paddingTop: 'calc(2rem + env(safe-area-inset-top))'}}>
      <div className="w-full max-w-sm mx-auto">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">←</Link>
          <div>
            <h1 className="text-xl font-bold text-white">AI 코스 추천</h1>
            <p className="text-gray-500 text-sm">조건을 입력하면 AI가 코스를 설계해요</p>
          </div>
        </div>

        {/* 폼 */}
        <div className="space-y-5">
          {/* 출발지 */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">출발지</label>
            <input
              type="text"
              value={startLocation}
              onChange={e => setStartLocation(e.target.value)}
              placeholder="예: 서울 강남구, 부산 해운대구"
              data-testid="ai-start-input"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* 소요 시간 */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">소요 시간</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(h => (
                <button
                  key={h}
                  onClick={() => setDuration(h)}
                  data-testid={`ai-duration-${h}`}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                    duration === h
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {h}시간
                </button>
              ))}
            </div>
          </div>

          {/* 난이도 */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">난이도</label>
            <div className="flex flex-col gap-2">
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  data-testid={`ai-difficulty-${d}`}
                  className={`py-3 px-4 rounded-xl text-sm font-medium text-left transition-colors ${
                    difficulty === d
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleSubmit}
            data-testid="btn-ai-generate"
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors"
          >
            🤖 AI 코스 생성
          </button>
        </div>
      </div>
    </div>
  )
}
