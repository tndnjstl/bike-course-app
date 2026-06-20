import { test, expect } from '@playwright/test'

function setupMocks(page: any) {
  return page.addInitScript(() => {
    (window as any).kakao = {
      maps: {
        Map: class { constructor() {} setCenter() {} setBounds() {} },
        LatLng: class { constructor() {} getLat() { return 37.5 } getLng() { return 126.9 } },
        LatLngBounds: class { extend() {} },
        Marker: class { constructor() {} setMap() {} },
        InfoWindow: class { constructor() {} open() {} },
        Polyline: class { constructor() {} setMap() {} },
        event: { addListener: () => {} },
        services: {
          Places: class {
            keywordSearch(q: string, cb: Function) {
              cb([
                { place_name: '한강공원', road_address_name: '서울 영등포구', address_name: '', y: '37.5283', x: '126.9295' },
                { place_name: '여의도', road_address_name: '서울 영등포구', address_name: '', y: '37.5217', x: '126.9241' },
              ], 'OK')
            }
          },
          Status: { OK: 'OK' },
        },
      },
    }
  })
}

function setupOsrmMock(page: any) {
  return page.route('**/router.project-osrm.org/**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 8000,
          duration: 1800,
          geometry: { coordinates: [[126.9295, 37.5283], [126.9241, 37.5217]] },
        }],
      }),
    })
  })
}

async function addTwoWaypoints(page: any) {
  await page.getByTestId('place-search-input').fill('한강')
  await page.waitForSelector('[data-testid="search-results"]')
  await page.getByText('한강공원').click()

  await page.waitForTimeout(200)

  await page.getByTestId('place-search-input').fill('여의')
  await page.waitForSelector('[data-testid="search-results"]')
  await page.getByText('여의도').click()
}

test.describe('코스 저장 기능', () => {
  test('경유지 2개 이상일 때 코스 저장 버튼이 활성화된다', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/course')
    await setupOsrmMock(page)

    await addTwoWaypoints(page)

    await expect(page.getByTestId('btn-save')).not.toBeDisabled()
  })

  test('저장 버튼 클릭 시 다이얼로그가 열린다', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/course')
    await setupOsrmMock(page)

    await addTwoWaypoints(page)
    await page.waitForSelector('[data-testid="route-result"]')
    await page.getByTestId('btn-save').click()

    await expect(page.getByRole('heading', { name: '코스 저장' })).toBeVisible()
    await expect(page.getByTestId('btn-confirm-save')).toBeVisible()
  })

  test('저장 후 저장됨 표시가 나타난다', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/course')
    await setupOsrmMock(page)

    await addTwoWaypoints(page)
    await page.waitForSelector('[data-testid="route-result"]')
    await page.getByTestId('btn-save').click()
    await page.getByTestId('btn-confirm-save').click()

    await expect(page.getByText('저장됨 ✓')).toBeVisible()
  })
})
