import { NextRequest, NextResponse } from 'next/server'

export interface AiWaypoint {
  name: string
  lat: number
  lng: number
  description?: string
}

const MOCK_COURSES: Record<string, AiWaypoint[]> = {
  default: [
    { name: '한강공원 반포지구', lat: 37.5128, lng: 126.9985, description: '자전거 도로 시작점' },
    { name: '반포대교', lat: 37.5145, lng: 126.9934, description: '한강 뷰 포인트' },
    { name: '여의도 한강공원', lat: 37.5277, lng: 126.9326, description: '넓은 자전거 도로' },
    { name: '망원 한강공원', lat: 37.5504, lng: 126.8993, description: '조용한 코스' },
  ],
  easy: [
    { name: '올림픽공원', lat: 37.5219, lng: 127.1220, description: '자전거 친화 공원' },
    { name: '몽촌토성', lat: 37.5174, lng: 127.1213, description: '역사 유적 코스' },
    { name: '풍납토성', lat: 37.5303, lng: 127.1267, description: '평지 구간' },
  ],
  hard: [
    { name: '북한산 둘레길 입구', lat: 37.6616, lng: 126.9745, description: '오르막 시작' },
    { name: '구기터널', lat: 37.6300, lng: 126.9650, description: '주요 고도 구간' },
    { name: '홍은동', lat: 37.5940, lng: 126.9427, description: '하강 코스' },
    { name: '불광천', lat: 37.5990, lng: 126.9330, description: '자전거도로 합류' },
  ],
}

async function generateWithClaude(
  startLocation: string,
  duration: number,
  difficulty: string
): Promise<AiWaypoint[]> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `당신은 한국 자전거 코스 전문가입니다.
사용자가 요청한 조건에 맞는 자전거 코스 경유지를 추천합니다.
반드시 실제 존재하는 한국의 장소를 추천하고, 정확한 위도/경도를 제공해야 합니다.
응답은 반드시 JSON 배열만 반환하고 다른 텍스트는 포함하지 마세요.`,
    messages: [{
      role: 'user',
      content: `출발지: ${startLocation}
소요 시간: 약 ${duration}시간
난이도: ${difficulty}

위 조건에 맞는 자전거 코스 경유지 3-5개를 JSON 배열로 추천해주세요.
형식:
[
  {"name": "장소명", "lat": 위도, "lng": 경도, "description": "간단한 설명"}
]`,
    }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('unexpected response')

  const text = content.text.trim()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('no json in response')

  return JSON.parse(jsonMatch[0]) as AiWaypoint[]
}

export async function POST(req: NextRequest) {
  const { startLocation, duration, difficulty } = await req.json()

  if (!startLocation || !duration || !difficulty) {
    return NextResponse.json({ error: '필수 항목이 없습니다' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const key = difficulty === 'easy' ? 'easy' : difficulty === 'hard' ? 'hard' : 'default'
    const waypoints = MOCK_COURSES[key] || MOCK_COURSES.default
    return NextResponse.json({ waypoints, source: 'mock' })
  }

  try {
    const waypoints = await generateWithClaude(startLocation, duration, difficulty)
    return NextResponse.json({ waypoints, source: 'claude' })
  } catch (err) {
    console.error('AI course error:', err)
    const key = difficulty === 'easy' ? 'easy' : difficulty === 'hard' ? 'hard' : 'default'
    return NextResponse.json({ waypoints: MOCK_COURSES[key], source: 'fallback' })
  }
}
