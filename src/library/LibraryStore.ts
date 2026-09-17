import type {
  Wallpaper,
} from './library.types'

const STORAGE_KEY =
  'wallcarousel-library'

export function loadLibrary(): Wallpaper[] {
  try {
    const stored =
      localStorage.getItem(
        STORAGE_KEY,
      )

    if (!stored) {
      return []
    }

    return JSON.parse(
      stored,
    ) as Wallpaper[]
  } catch {
    return []
  }
}

export function saveLibrary(
  wallpapers: Wallpaper[],
): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(wallpapers),
  )
}
