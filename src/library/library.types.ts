export interface Wallpaper {
  id: string
  path: string
  name: string
  extension: string
}

export interface WallpaperLibrary {
  wallpapers: Wallpaper[]
}
