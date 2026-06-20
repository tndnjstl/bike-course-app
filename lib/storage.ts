export interface SavedCourse {
  id: string
  name: string
  waypoints: Array<{ name: string; coord: { lat: number; lng: number } }>
  geometry: Array<{ lat: number; lng: number }>
  distance: number
  duration: number
  savedAt: string
}

const STORAGE_KEY = 'bike_saved_courses'

export function saveCourse(data: Omit<SavedCourse, 'id' | 'savedAt'>): SavedCourse {
  const courses = loadCourses()
  const course: SavedCourse = {
    ...data,
    id: `${performance.now().toString(36)}-${courses.length}`,
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([course, ...courses].slice(0, 20)))
  return course
}

export function loadCourses(): SavedCourse[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function deleteCourse(id: string): void {
  const courses = loadCourses().filter(c => c.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses))
}
