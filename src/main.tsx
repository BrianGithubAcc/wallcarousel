import {
  lazy,
  Suspense,
  StrictMode,
} from 'react'

import {
  createRoot,
} from 'react-dom/client'

import {
  getCurrentWindow,
} from '@tauri-apps/api/window'

import './index.css'

const App = lazy(() => import('./App.tsx'))
const WallpaperOverlay = lazy(() =>
  import('./components/Overlay/WallpaperOverlay').then((module) => ({
    default: module.WallpaperOverlay,
  })),
)

let isWallpaperOverlay =
  false

try {
  isWallpaperOverlay =
    getCurrentWindow().label ===
    'wallpaper-overlay'
} catch {
  /*
   * Running directly in an ordinary browser
   * rather than through Tauri.
   */
  isWallpaperOverlay =
    false
}

if (
  isWallpaperOverlay
) {
  document.documentElement
    .classList.add(
      'wallpaper-overlay-document',
    )
}

createRoot(
  document.getElementById(
    'root',
  )!,
).render(
  <StrictMode>
    <Suspense fallback={null}>
      {
        isWallpaperOverlay
          ? (
            <WallpaperOverlay />
          )
          : (
            <App />
          )
      }
    </Suspense>
  </StrictMode>,
)
