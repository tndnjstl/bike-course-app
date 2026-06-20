'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadCourses, deleteCourse, type SavedCourse } from '@/lib/storage'
import { formatDistance, formatDuration } from '@/lib/osrm'

export default function SavedCourseList() {
  const [courses, setCourses] = useState<SavedCourse[]>([])

  useEffect(() => {
    setCourses(loadCourses())
  }, [])

  const handleDelete = (id: string) => {
    deleteCourse(id)
    setCourses(prev => prev.filter(c => c.id !== id))
  }

  if (courses.length === 0) {
    return (
      <div
        data-testid="saved-courses"
        className="text-gray-600 text-sm text-center py-6 border border-gray-800 rounded-xl"
      >
        저장된 코스가 없어요
      </div>
    )
  }

  return (
    <div data-testid="saved-courses" className="space-y-2">
      {courses.map(course => (
        <div
          key={course.id}
          className="bg-gray-800 rounded-xl p-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{course.name}</div>
            <div className="text-gray-500 text-xs mt-0.5">
              {formatDistance(course.distance)} · {formatDuration(course.duration)} · {course.waypoints.length}개 경유지
            </div>
          </div>
          <button
            onClick={() => handleDelete(course.id)}
            className="text-gray-600 hover:text-red-400 text-lg flex-shrink-0"
            aria-label="코스 삭제"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
