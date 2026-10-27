import { useEffect, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { drawCover, drawTransition, previewEffects } from '../Slideshow/transitionPreviewEffects'
import './WallpaperTransitionOverlay.css'

interface TransitionRequest {
  id: number
  fromPath: string | null
  toPath: string
  transition: string
  durationSeconds: number
  fps: number
}

interface WallpaperAsset {
  path: string
  image: HTMLImageElement | null
}

interface TransitionViewport {
  width: number
  height: number
}

const transitionEvent = 'wallpaper-transition-start'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Transition image unavailable'))
    image.src = url
  })
}

async function loadWallpaper(path: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(convertFileSrc(path))
  } catch {
    const thumbnail = await invoke<string>('generate_thumbnail', { path })
    return loadImage(convertFileSrc(thumbnail))
  }
}

export function WallpaperTransitionOverlay() {
  const [request, setRequest] = useState<TransitionRequest | null>(null)
  const latestRequest = useRef(0)

  useEffect(() => {
    let disposed = false
    const accept = (next: TransitionRequest | null) => {
      if (!next || next.id <= latestRequest.current) return
      latestRequest.current = next.id
      setRequest(next)
    }

    const refresh = async () => {
      try {
        const pending = await invoke<TransitionRequest | null>('get_wallpaper_transition')
        if (!disposed) accept(pending)
      } catch {
        // The native window may still be starting; the next poll retries.
      }
    }

    let unlisten: (() => void) | undefined
    void getCurrentWindow().listen<TransitionRequest>(transitionEvent, event => accept(event.payload))
      .then(cleanup => { unlisten = cleanup })
      .catch(() => { /* Browser-only development has no Tauri event bridge. */ })
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 250)

    return () => {
      disposed = true
      window.clearInterval(timer)
      unlisten?.()
    }
  }, [])

  return <main className="wallpaper-transition-root">{request && <TransitionPlayer key={request.id} request={request} onComplete={() => setRequest(current => current?.id === request.id ? null : current)} />}</main>
}

function TransitionPlayer({ request, onComplete }: { request: TransitionRequest, onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const completed = useRef(false)
  const [assets, setAssets] = useState<WallpaperAsset[]>([])

  useEffect(() => {
    let cancelled = false
    const paths = [request.fromPath, request.toPath].filter((path): path is string => Boolean(path))
    void Promise.all(paths.map(async path => {
      try {
        return { path, image: await loadWallpaper(path) }
      } catch {
        return { path, image: null }
      }
    })).then(next => { if (!cancelled) setAssets(next) })
    return () => { cancelled = true }
  }, [request])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const before = assets.find(asset => asset.path === request.fromPath)?.image ?? null
    const after = assets.find(asset => asset.path === request.toPath)?.image ?? null
    if (!assets.some(asset => asset.path === request.toPath)) return

    let stopped = false
    let animation = 0
    let revealed = false
    let handoff: Animation | undefined
    let wallpaperUpdate: Promise<void> | undefined
    const cleanup = () => {
      stopped = true
      cancelAnimationFrame(animation)
      handoff?.cancel()
    }
    const applyWallpaper = () => {
      wallpaperUpdate ??= invoke('finish_wallpaper_transition', { id: request.id, path: request.toPath })
        // The System Events reply acknowledges the setting, not the desktop
        // compositor's repaint. Keep our image above the desktop during it.
        .then(() => new Promise<void>(resolve => window.setTimeout(resolve, 400)))
      return wallpaperUpdate
    }
    const finish = async () => {
      if (completed.current) return
      completed.current = true
      try {
        await applyWallpaper()
        if (stopped) return
        if (revealed) {
          // Blend into the actual desktop before removing the native window.
          // Its compositor can round the crop or resample the image differently
          // from the canvas, so an opaque-to-hidden cut can visibly jump.
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            canvas.style.opacity = '0'
          } else {
            handoff = canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 180,
              easing: 'ease-out',
              fill: 'forwards',
            })
            await handoff.finished
          }
          if (stopped) return
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          })
        }
        if (stopped) return
        await invoke('close_wallpaper_transition', { id: request.id })
      } catch {
        if (stopped) return
        try { await invoke('cancel_wallpaper_transition', { id: request.id }) } catch { /* Keep shutdown best-effort. */ }
      }
      if (!stopped) onComplete()
    }
    if (!after) {
      void finish()
      return cleanup
    }

    let width = 0
    let height = 0
    const context = canvas.getContext('2d')
    if (!context) {
      void finish()
      return cleanup
    }

    const chosen = request.transition === 'random'
      ? previewEffects[Math.floor(Math.random() * previewEffects.length)]
      : request.transition
    const origin = chosen === 'any' ? { x: Math.random(), y: Math.random() } : { x: .5, y: .5 }
    const reducedMotion = !before || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = Math.max(.1, request.durationSeconds) * 1000
    const fps = Math.max(1, request.fps)
    const beforeSurface = document.createElement('canvas')
    const afterSurface = document.createElement('canvas')
    const beforeContext = beforeSurface.getContext('2d')
    const afterContext = afterSurface.getContext('2d')
    if (!beforeContext || !afterContext) {
      void finish()
      return cleanup
    }
    const resizeSurfaces = () => {
      const scale = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.round(window.innerWidth * scale))
      const nextHeight = Math.max(1, Math.round(window.innerHeight * scale))
      if (width === nextWidth && height === nextHeight) return false
      width = nextWidth
      height = nextHeight
      canvas.width = beforeSurface.width = afterSurface.width = width
      canvas.height = beforeSurface.height = afterSurface.height = height
      drawCover(beforeContext, before ?? after, false, width, height)
      drawCover(afterContext, after, true, width, height)
      return true
    }
    resizeSurfaces()

    let started: number | undefined
    let lastFrame = -1
    const animate = (now: number) => {
      if (stopped) return
      const resized = resizeSurfaces()
      started ??= now
      const progress = reducedMotion ? 1 : Math.min(1, (now - started) / duration)
      if (progress >= 0.96) {
        // Start the native update near the end, continue smoothly to the final
        // image, then keep that complete image visible until the update settles.
        void applyWallpaper().catch(() => { /* finish handles update failures. */ })
      }
      const frameIndex = Math.floor((now - started) * fps / 1000)
      if (resized || frameIndex !== lastFrame || progress === 1) {
        drawTransition(context, beforeSurface, afterSurface, chosen, progress, origin, width, height)
        lastFrame = frameIndex
      }
      if (progress === 1) {
        void finish()
        return
      }
      animation = requestAnimationFrame(animate)
    }

    drawCover(context, before ?? after, false, width, height)
    // Do not expose a blank canvas or the previous transition's retained frame
    // while this request's image files are still loading.
    void invoke<TransitionViewport | null>('show_wallpaper_transition', { id: request.id })
      .then(async viewport => {
        if (stopped || !viewport) return
        // Native and WebKit sizing are asynchronous. Keep the native window
        // invisible until CSS pixels agree with its logical content size for
        // two frames, then rebuild the canvases before exposing any pixels.
        let stableFrames = 0
        const deadline = performance.now() + 1500
        while (stableFrames < 2) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          if (stopped) return
          const matches = Math.abs(window.innerWidth - viewport.width) < 1
            && Math.abs(window.innerHeight - viewport.height) < 1
          stableFrames = matches ? stableFrames + 1 : 0
          if (performance.now() > deadline) throw new Error('Transition viewport did not settle')
        }
        resizeSurfaces()
        drawCover(context, before ?? after, false, width, height)
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (stopped) return
        await invoke('reveal_wallpaper_transition', { id: request.id })
        if (stopped) return
        revealed = true
        animation = requestAnimationFrame(animate)
      })
      .catch(() => { if (!stopped) void finish() })
    return cleanup
  }, [assets, onComplete, request])

  return <canvas ref={canvasRef} className="wallpaper-transition-canvas" aria-label="Applying wallpaper transition" />
}
