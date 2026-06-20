import type { Coordinate } from './osrm'

export function buildKakaoMapUrl(waypoints: Coordinate[]): string {
  if (waypoints.length < 2) return ''
  const sp = waypoints[0]
  const ep = waypoints[waypoints.length - 1]
  const vias = waypoints.slice(1, -1).slice(0, 3) // 중간 경유지 최대 3개 (sp+ep 포함 5개)

  const params = new URLSearchParams({
    sp: `${sp.lat},${sp.lng}`,
    ep: `${ep.lat},${ep.lng}`,
    by: 'BICYCLE',
  })
  vias.forEach((v, i) => {
    params.set(i === 0 ? 'vp' : `vp${i + 1}`, `${v.lat},${v.lng}`)
  })

  return `kakaomap://route?${params.toString()}`
}

export function buildNaverMapUrl(waypoints: Coordinate[]): string {
  if (waypoints.length < 2) return ''
  const sp = waypoints[0]
  const ep = waypoints[waypoints.length - 1]

  const params = new URLSearchParams({
    slat: String(sp.lat),
    slng: String(sp.lng),
    dlat: String(ep.lat),
    dlng: String(ep.lng),
    appname: 'com.bikecourse.app',
  })

  return `nmap://route/bicycle?${params.toString()}`
}

export function openMapApp(url: string, fallbackStore: 'kakao' | 'naver') {
  const storeUrl =
    fallbackStore === 'kakao'
      ? 'https://apps.apple.com/kr/app/id304608425'
      : 'https://apps.apple.com/kr/app/id311867728'

  window.location.href = url
  setTimeout(() => {
    if (document.hidden) return
    if (confirm('지도 앱이 설치되어 있지 않습니다. 스토어로 이동할까요?')) {
      window.location.href = storeUrl
    }
  }, 2000)
}
