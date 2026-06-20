import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bike Course',
  description: '자전거 코스 설계 앱',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  return (
    <html lang="ko">
      <head>
        {kakaoKey && kakaoKey !== '여기에_카카오맵_앱키_입력' && (
          <script
            type="text/javascript"
            src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services`}
          />
        )}
      </head>
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  )
}
