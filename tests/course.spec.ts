import { test, expect } from '@playwright/test'

test.describe('코스 설계 화면', () => {
  test.beforeEach(async ({ page }) => {
    // 카카오 SDK mock
    await page.addInitScript(() => {
      (window as any).kakao = {
        maps: {
          Map: class { constructor() {} setCenter() {} setBounds() {} },
          LatLng: class { constructor(lat: number, lng: number) {} getLat() { return 37.5 } getLng() { return 126.9 } },
          LatLngBounds: class { extend() {} },
          Marker: class { constructor() {} setMap() {} },
          InfoWindow: class { constructor() {} open() {} },
          Polyline: class { constructor() {} setMap() {} },
          event: { addListener: () => {} },
          services: {
            Places: class {
              keywordSearch(q: string, cb: Function) {
                cb([
                  { place_name: '한강공원', road_address_name: '서울 영등포구', address_name: '서울 영등포구', y: '37.5283', x: '126.9295' },
                  { place_name: '여의도', road_address_name: '서울 영등포구 여의도동', address_name: '', y: '37.5217', x: '126.9241' },
                ], 'OK')
              }
            },
            Status: { OK: 'OK' },
          },
        },
      }
    })
    await page.goto('/course')
  })

  test('코스 설계 페이지 타이틀이 표시된다', async ({ page }) => {
    await expect(page.getByText('코스 설계')).toBeVisible()
  })

  test('장소 검색 입력창이 있다', async ({ page }) => {
    await expect(page.getByTestId('place-search-input')).toBeVisible()
  })

  test('지도 영역이 렌더링된다', async ({ page }) => {
    await expect(page.getByTestId('kakao-map')).toBeVisible()
  })

  test('장소 검색 시 결과가 표시된다', async ({ page }) => {
    await page.getByTestId('place-search-input').fill('한강')
    await page.waitForSelector('[data-testid="search-results"]')
    await expect(page.getByTestId('search-results')).toBeVisible()
    await expect(page.getByText('한강공원')).toBeVisible()
  })

  test('경유지 추가 시 목록에 표시된다', async ({ page }) => {
    await page.getByTestId('place-search-input').fill('한강')
    await page.waitForSelector('[data-testid="search-results"]')
    await page.getByText('한강공원').click()
    await expect(page.getByTestId('waypoint-list')).toBeVisible()
    await expect(page.getByText('한강공원')).toBeVisible()
  })

  test('코스 옵션 버튼이 3개 표시된다', async ({ page }) => {
    await expect(page.getByTestId('option-bike')).toBeVisible()
    await expect(page.getByTestId('option-flat')).toBeVisible()
    await expect(page.getByTestId('option-shortest')).toBeVisible()
  })

  test('경유지 1개만 있으면 안내 시작 버튼이 비활성화된다', async ({ page }) => {
    await page.getByTestId('place-search-input').fill('한강')
    await page.waitForSelector('[data-testid="search-results"]')
    await page.getByText('한강공원').click()
    const btn = page.getByTestId('btn-start-guide')
    await expect(btn).toBeDisabled()
  })

  test('홈으로 돌아가기 링크가 있다', async ({ page }) => {
    await page.getByText('←').click()
    await expect(page).toHaveURL('/')
  })
})
