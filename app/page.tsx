import Link from 'next/link'
import SavedCourseList from '@/components/SavedCourseList'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4" style={{paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)'}}>
      <div className="w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">🚲</div>
          <h1 className="text-2xl font-bold text-white">Bike Course</h1>
          <p className="text-gray-400 text-sm mt-1">자전거 코스 설계 앱</p>
        </div>

        {/* 메인 버튼 */}
        <div className="flex flex-col gap-4">
          <Link
            href="/course"
            data-testid="btn-direct"
            className="block bg-green-600 hover:bg-green-500 rounded-2xl p-6 transition-colors"
          >
            <div className="text-3xl mb-2">🗺️</div>
            <div className="text-lg font-bold text-white">직접 코스 설계</div>
            <div className="text-green-200 text-sm mt-1">원하는 장소를 찍어 코스를 만들어요</div>
          </Link>

        </div>

        {/* 저장된 코스 */}
        <div className="mt-8">
          <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">최근 코스</div>
          <SavedCourseList />
        </div>
      </div>
    </div>
  )
}
