import { test, expect } from '@playwright/test'

test.describe('홈 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('앱 타이틀이 표시된다', async ({ page }) => {
    await expect(page.getByText('Bike Course')).toBeVisible()
  })

  test('직접 코스 설계 버튼이 있다', async ({ page }) => {
    await expect(page.getByTestId('btn-direct')).toBeVisible()
    await expect(page.getByText('직접 코스 설계')).toBeVisible()
  })

  test('AI 코스 추천 버튼이 있다', async ({ page }) => {
    await expect(page.getByTestId('btn-ai')).toBeVisible()
    await expect(page.getByText('AI 코스 추천')).toBeVisible()
  })

  test('저장된 코스 영역이 표시된다', async ({ page }) => {
    await expect(page.getByTestId('saved-courses')).toBeVisible()
  })

  test('직접 코스 설계 클릭 시 /course로 이동한다', async ({ page }) => {
    await page.getByTestId('btn-direct').click()
    await expect(page).toHaveURL('/course')
  })

  test('AI 추천 클릭 시 /ai로 이동한다', async ({ page }) => {
    await page.getByTestId('btn-ai').click()
    await expect(page).toHaveURL('/ai')
  })
})
