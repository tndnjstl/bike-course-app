'use client'

import { useState, useRef } from 'react'
import type { Coordinate } from '@/lib/osrm'

interface Place {
  name: string
  address: string
  coord: Coordinate
}

interface Props {
  onSelect: (place: Place) => void
  placeholder?: string
}

async function searchNominatim(q: string): Promise<Place[]> {
  const params = new URLSearchParams({
    q,
    format: 'json',
    countrycodes: 'kr',
    limit: '5',
    'accept-language': 'ko',
    addressdetails: '1',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'BikeCourseApp/1.0' },
  })
  const data = await res.json()
  return data.map((item: any) => ({
    name: item.name || item.display_name.split(',')[0],
    address: item.display_name,
    coord: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
  }))
}

async function searchKakao(q: string): Promise<Place[]> {
  return new Promise(resolve => {
    const ps = new window.kakao.maps.services.Places()
    ps.keywordSearch(q, (data: any[], status: string) => {
      if (status !== window.kakao.maps.services.Status.OK) { resolve([]); return }
      resolve(data.slice(0, 5).map(p => ({
        name: p.place_name,
        address: p.road_address_name || p.address_name,
        coord: { lat: parseFloat(p.y), lng: parseFloat(p.x) },
      })))
    })
  })
}

export default function PlaceSearch({ onSelect, placeholder = '장소 검색...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); return }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const places = window.kakao?.maps?.services
          ? await searchKakao(q)
          : await searchNominatim(q)
        setResults(places)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  const handleSelect = (place: Place) => {
    onSelect(place)
    setQuery('')
    setResults([])
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => search(e.target.value)}
        placeholder={placeholder}
        data-testid="place-search-input"
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
      />
      {loading && (
        <div className="absolute right-3 top-3 text-gray-500 text-xs">검색 중...</div>
      )}
      {results.length > 0 && (
        <ul
          data-testid="search-results"
          className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-xl"
        >
          {results.map((r, i) => (
            <li
              key={i}
              onClick={() => handleSelect(r)}
              className="px-4 py-3 hover:bg-gray-800 cursor-pointer border-b border-gray-800 last:border-0"
            >
              <div className="text-white text-sm font-medium">{r.name}</div>
              <div className="text-gray-500 text-xs mt-0.5 truncate">{r.address}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
