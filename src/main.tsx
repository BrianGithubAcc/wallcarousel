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
const WallpaperTransitionOverlay = lazy(() =>
  import('./components/Overlay/WallpaperTransitionOverlay').then((module) => ({
    default: module.WallpaperTransitionOverlay,
  })),
)

let isWallpaperOverlay =
  false
let isWallpaperTransition =
  false

try {
  const label = getCurrentWindow().label
  isWallpaperOverlay = label === 'wallpaper-overlay'
  isWallpaperTransition = label === 'wallpaper-transition'
} catch {
  /*
   * Running directly in an ordinary browser
   * rather than through Tauri.
   */
  isWallpaperOverlay =
    false
  isWallpaperTransition =
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

if (
  isWallpaperTransition
) {
  document.documentElement
    .classList.add(
      'wallpaper-transition-document',
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
        isWallpaperTransition
          ? (
            <WallpaperTransitionOverlay />
          )
          : isWallpaperOverlay
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
