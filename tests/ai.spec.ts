import { test, expect } from '@playwright/test'

const MOCK_WAYPOINTS = [
  { name: '한강공원', lat: 37.5128, lng: 126.9985, description: '자전거 도로 시작점' },
  { name: '여의도', lat: 37.5277, lng: 126.9326, description: '넓은 자전거 도로' },
  { name: '망원 한강공원', lat: 37.5504, lng: 126.8993, description: '조용한 코스' },
]

test.describe('AI 코스 추천 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).kakao = {
        maps: {
          Map: class { constructor() {} setCenter() {} setBounds() {} },
          LatLng: class { constructor() {} getLat() { return 37.5 } getLng() { return 126.9 } },
          LatLngBounds: class { extend() {} },
          Marker: class { constructor() {} setMap() {} },
          InfoWindow: class { constructor() {} open() {} },
          Polyline: class { constructor() {} setMap() {} },
          event: { addListener: () => {} },
          services: { Places: class {}, Status: { OK: 'OK' } },
        },
      }
    })
    await page.goto('/ai')
  })

  test('AI 코스 추천 폼이 표시된다', async ({ page }) => {
    await expect(page.getByText('AI 코스 추천')).toBeVisible()
    await expect(page.getByTestId('ai-start-input')).toBeVisible()
    await expect(page.getByTestId('ai-duration-2')).toBeVisible()
    await expect(page.getByTestId('ai-difficulty-medium')).toBeVisible()
    await expect(page.getByTestId('btn-ai-generate')).toBeVisible()
  })

  test('출발지 없이 제출 시 에러가 표시된다', async ({ page }) => {
    await page.getByTestId('btn-ai-generate').click()
    await expect(page.getByText('출발지를 입력해주세요')).toBeVisible()
  })

  test('소요 시간 버튼을 선택할 수 있다', async ({ page }) => {
    await page.getByTestId('ai-duration-3').click()
    await expect(page.getByTestId('ai-duration-3')).toHaveClass(/bg-purple-600/)
  })

  test('난이도 버튼을 선택할 수 있다', async ({ page }) => {
    await page.getByTestId('ai-difficulty-hard').click()
    await expect(page.getByTestId('ai-difficulty-hard')).toHaveClass(/bg-purple-600/)
  })

  test('API 응답 후 결과 화면이 표시된다', async ({ page }) => {
    // OSRM mock
    await page.route('**/router.project-osrm.org/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{
            distance: 12500,
            duration: 2700,
            geometry: {
              coordinates: [[126.9985, 37.5128], [126.9326, 37.5277], [126.8993, 37.5504]],
            },
          }],
        }),
      })
    })

    // AI API mock
    await page.route('**/api/ai-course', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ waypoints: MOCK_WAYPOINTS, source: 'mock' }),
      })
    })

    await page.getByTestId('ai-start-input').fill('서울 강남구')
    await page.getByTestId('btn-ai-generate').click()

    await expect(page.getByTestId('ai-route-result')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('btn-ai-start-guide')).toBeVisible()
  })

  test('홈으로 돌아가기 링크가 있다', async ({ page }) => {
    await page.getByRole('link', { name: '←' }).click()
    await expect(page).toHaveURL('/')
  })
})
