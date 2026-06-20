import { test, expect } from '@playwright/test'
import { buildKakaoMapUrl, buildNaverMapUrl } from '../lib/kakao-scheme'

const waypoints = [
  { lat: 37.5283, lng: 126.9295 },
  { lat: 37.5350, lng: 126.9400 },
  { lat: 37.5450, lng: 126.9500 },
]

test.describe('카카오맵 URL 스킴 생성', () => {
  test('출발지·목적지 포함 URL 생성', () => {
    const url = buildKakaoMapUrl(waypoints)
    expect(url).toContain('kakaomap://route')
    expect(url).toContain('sp=37.5283%2C126.9295')
    expect(url).toContain('ep=37.545%2C126.95')
    expect(url).toContain('by=BICYCLE')
  })

  test('경유지가 포함된다', () => {
    const url = buildKakaoMapUrl(waypoints)
    expect(url).toContain('vp=')
  })

  test('경유지 2개 미만이면 빈 문자열 반환', () => {
    const url = buildKakaoMapUrl([waypoints[0]])
    expect(url).toBe('')
  })
})

test.describe('네이버지도 URL 스킴 생성', () => {
  test('출발지·목적지 포함 URL 생성', () => {
    const url = buildNaverMapUrl(waypoints)
    expect(url).toContain('nmap://route/bicycle')
    expect(url).toContain('slat=37.5283')
    expect(url).toContain('dlat=37.545')
  })

  test('경유지 2개 미만이면 빈 문자열 반환', () => {
    const url = buildNaverMapUrl([waypoints[0]])
    expect(url).toBe('')
  })
})
