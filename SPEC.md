# Bike Course App — 기획서

> 자전거 코스 설계 모바일 웹앱. 실시간 경로 탐색, 고도 프로파일, 자전거도로 색상 구분을 제공한다.

---

## 1. 화면 구성

### 1-1. 홈 (`/`)
- **직접 코스 설계** 버튼 → `/course`
- **AI 코스 추천** 버튼 → `/ai`
- **최근 코스** 목록 (로컬 저장된 코스 카드)

### 1-2. 코스 설계 (`/course`) ← 핵심 화면
- 상단: 헤더 (뒤로가기 / 코스 설계 제목 / 저장됨 표시)
- 중단: 지도 (Leaflet / OSM 타일)
- 하단: 드래그 패널 (슬롯 입력 + 결과)

### 1-3. AI 추천 (`/ai`)
- 시간·난이도 입력 → Claude API 호출 → 추천 코스 표시

---

## 2. 지도 / 패널 레이아웃

### 드래그 분리 핸들
- 지도와 하단 패널 사이에 드래그 핸들(pill) 존재
- 드래그로 비율 조절, **3단 스냅** 위치로 자동 이동:

| 스냅 | 패널 비율 | 설명 |
|------|-----------|------|
| 맨위 | 15% | 지도 전체보기 |
| 가운데 | 50% | 지도 + 경로 반반 (기본값) |
| 맨아래 | 85% | 경로 전체보기 |

- 지도 크기 변경 시 Leaflet `invalidateSize()` 자동 호출

---

## 3. 하단 패널 — 경로 입력

### 슬롯 (출발 / 경유 / 도착)
- 네이버지도 스타일 수직 슬롯 UI
- 출발: 초록 도트 + GPS 현재위치 버튼
- 경유(1개 이상): 파랑 도트 + × 삭제 버튼
- 도착: 빨강 도트 + × 삭제 버튼 (입력 후)
- 모든 슬롯은 **드래그 앤 드롭**으로 순서 변경 가능 (핸들 아이콘 우측)

### 경유지 추가
- `+ 경유지 추가` 점선 버튼 → 출발/도착 사이에 새 슬롯 삽입

### 코스 옵션
| 옵션 | OSRM 프로파일 | 설명 |
|------|--------------|------|
| 🚲 자전거도로 | bike | 자전거 경로 우선 (기본값) |
| 🏞️ 평지 우선 | bike | 자전거 경로 + 경사 낮은 구간 |
| ⚡ 최단거리 | foot | 최단 경로 |

- 옵션 변경 시 경로 즉시 재계산

---

## 4. 장소 검색

### 검색 오버레이
- 슬롯 탭 → 전체화면 검색 오버레이
- Kakao Maps Places API (우선) → Nominatim (폴백)
- 400ms 디바운스

### 장소 검색 히스토리
- localStorage `bike-search-history`
- 최대 10개, 중복 시 최상단 이동
- 검색어 없을 때 히스토리 목록 표시
- × 버튼으로 개별 삭제

---

## 5. 경로 계산

### OSRM
- 엔드포인트: `https://router.project-osrm.org/route/v1/{profile}/{coords}`
- `overview=full&geometries=geojson&steps=true`
- 공개 서버 속도 보정: **20km/h** 기준 직접 계산 (카카오·네이버 기준)
  - `duration = distance(m) / (20000/3600)`

### 지도 경로 폴리라인
- 자전거도로 구간: **초록** `#22c55e`
- 일반도로 구간: **파랑** `#3b82f6`
- `roadTypes` 로드 전: 단색 초록 폴리라인

---

## 6. 자전거도로 판별 (Overpass API)

### 쿼리 대상 태그
```
highway=cycleway
highway=path + bicycle=yes/designated
highway=track + bicycle=yes/designated
highway=footway + bicycle=yes/designated
highway=residential/secondary/tertiary + cycleway=*
cycleway=lane/track/yes/shared_lane
cycleway:left/right=lane/track
bicycle=designated
```

### 판별 알고리즘
1. 경로 geometry에서 **30개 샘플 포인트** 추출
2. Overpass에서 bbox 내 자전거 way 세그먼트 전체 수집
3. 각 샘플 포인트 → **가장 가까운 세그먼트까지 수직 거리** 계산 (`distToSegment`)
4. **25m 이내** → `bike`, 초과 → `road`
5. 30개 타입을 전체 geometry에 비례 매핑 → 폴리라인 색상 분리

> 기존 노드 거리 방식 대비: 노드 간격 50-100m 구간에서도 누락 없이 정확하게 판별

---

## 7. 고도 프로파일

### API
- Primary: Open-Meteo `https://api.open-meteo.com/v1/elevation`
- Fallback: opentopodata (aster30m → srtm30m)
- 30개 샘플 포인트에서 고도값 수집

### 경로 요약 차트 (ElevationChart)
- 가로 전체 너비 (ResizeObserver)
- 구간별 사다리꼴 fill: 자전거도로=초록, 일반도로=회색
- 고도 라인: `#22c55e`
- X축: km 눈금 (총 거리에 따라 0.5/1/2/5/10km 간격)
- Y축: 최저/최고 고도(m)
- 경유지 위치: 수직 점선 + 레이블 (경유1, 도착)

---

## 8. 결과 카드

### 스탯 영역
| 항목 | 내용 |
|------|------|
| 거리 | 총 km (1km 미만 시 m) |
| 예상시간 | 20km/h 기준 |
| 총 오르막 | 고도 로드 후 표시 (↑Xm) |

- 경유지 2개 이상: 구간별 거리 (출발→경유1 Xkm, 경유1→도착 Xkm)

### 경로 요약 (접기/펼치기)
- 기본: **열림**
- 헤더 우측 삼각형 화살표로 토글
- 펼치면: 고도 차트 + 자전거도로/일반도로 범례

### 경로 구간 (접기/펼치기)
- 기본: **닫힘**
- 헤더 우측 삼각형 화살표로 토글
- 펼치면: OSRM steps 기반 구간 목록 (이름 / 타입 / 거리)
  - 자전거도로=초록, 일반도로=회색, 도보구간=노랑

---

## 9. 로딩 UI

- 경로 계산(`loading`) 또는 고도/도로분류(`elevLoading`) 중:
  - 결과 영역 전체에 **스피너 카드** 표시
  - 중앙 회전 스피너(`border-t-green-400 animate-spin`) + "준비중입니다..." 텍스트
- 완료 후: 실제 데이터 표시

---

## 10. 최근 길찾기 히스토리

- localStorage `bike-route-history`
- **최대 5개**, 중복(동일 경유지 순서) 시 최상단 이동
- **저장 시점**: 경로 계산 성공 시 (`runRoute`, `changeOption`)
- **표시 위치**: 코스 옵션 탭 아래, 경로 결과 없을 때
- **UI**: 자전거 아이콘 + 경유지 도트/라인 목록 + × 삭제
- **클릭**: 슬롯 전체 복원 + 경로 즉시 재계산

---

## 11. 코스 저장 / 공유

### 저장
- `💾 코스 저장` 버튼 → 이름 입력 다이얼로그
- localStorage `bike-courses`에 저장 (lib/storage.ts)
- 홈 화면 "최근 코스" 목록에 표시

### 공유
- `안내 시작 →` 버튼 → ShareModal
- 경로 공유 링크 생성

---

## 12. 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 |
| 지도 | Leaflet + OSM 타일 |
| 경로 | OSRM 공개 서버 |
| 장소 검색 | Kakao Maps Places API → Nominatim |
| 역지오코딩 | Nominatim |
| 고도 | Open-Meteo (primary) → opentopodata (fallback) |
| 도로분류 | Overpass API (OSM) |
| 저장 | localStorage (검색 히스토리 / 최근 길찾기 / 코스) |
| AI | Claude API (코스 추천) |

---

## 13. 파일 구조

```
app/
  page.tsx              # 홈 (직접설계 / AI추천 / 최근코스)
  course/page.tsx       # 코스 설계 메인
  ai/page.tsx           # AI 추천
  api/ai-course/        # Claude API 라우트

components/
  KakaoMap.tsx          # Leaflet 지도 (다색 폴리라인, 마커)
  ElevationChart.tsx    # 고도 차트 (ResizeObserver, 도로타입 색상)
  ShareModal.tsx        # 공유 모달
  SavedCourseList.tsx   # 저장된 코스 목록
  PlaceSearch.tsx       # 장소 검색 (미사용/참고용)

lib/
  osrm.ts               # OSRM 경로 계산, 20km/h 보정, 포맷터
  elevation.ts          # Open-Meteo / opentopodata 고도 API
  roadtype.ts           # Overpass 자전거도로 판별 (세그먼트 거리)
  storage.ts            # 코스 localStorage 저장/불러오기
  kakao-scheme.ts       # 카카오 딥링크 유틸
```

---

## 14. 주요 상수 / 파라미터

| 상수 | 값 | 설명 |
|------|----|------|
| BIKE_MPS | 20000/3600 | 20km/h 기준 속도 |
| 고도 샘플수 | 30 | geometry에서 추출 |
| 도로분류 샘플수 | 30 | geometry에서 추출 |
| 도로판별 임계값 | 25m | 세그먼트까지 거리 |
| 검색 히스토리 최대 | 10개 | localStorage |
| 길찾기 히스토리 최대 | 5개 | localStorage |
| 드래그 스냅 | [15%, 50%, 85%] | 패널 높이 비율 |
| 패널 핸들 높이 | 28px | |
