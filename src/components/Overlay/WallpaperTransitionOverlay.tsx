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
    const finish = async () => {
      if (completed.current) return
      completed.current = true
      try {
        await invoke('finish_wallpaper_transition', { id: request.id, path: request.toPath })
      } catch {
        try { await invoke('cancel_wallpaper_transition', { id: request.id }) } catch { /* Keep shutdown best-effort. */ }
      }
      onComplete()
    }
    if (!after) {
      if (assets.some(asset => asset.path === request.toPath)) void finish()
      return
    }

    const scale = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(window.innerWidth * scale))
    const height = Math.max(1, Math.round(window.innerHeight * scale))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return

    const chosen = request.transition === 'random'
      ? previewEffects[Math.floor(Math.random() * previewEffects.length)]
      : request.transition
    const origin = chosen === 'any' ? { x: Math.random(), y: Math.random() } : { x: .5, y: .5 }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = Math.max(.1, request.durationSeconds) * 1000
    const fps = Math.max(1, request.fps)
    const beforeSurface = document.createElement('canvas')
    beforeSurface.width = width
    beforeSurface.height = height
    const afterSurface = document.createElement('canvas')
    afterSurface.width = width
    afterSurface.height = height
    const beforeContext = beforeSurface.getContext('2d')
    const afterContext = afterSurface.getContext('2d')
    if (!beforeContext || !afterContext) return
    drawCover(beforeContext, before, false, width, height)
    drawCover(afterContext, after, true, width, height)

    let animation = 0
    let started = 0
    let lastFrame = -1
    let stopped = false
    const animate = (now: number) => {
      if (stopped) return
      if (!started) started = now
      const progress = reducedMotion ? 1 : Math.min(1, (now - started) / duration)
      const frameIndex = Math.floor((now - started) * fps / 1000)
      if (frameIndex !== lastFrame || progress === 1) {
        drawTransition(context, beforeSurface, afterSurface, chosen, progress, origin, width, height)
        lastFrame = frameIndex
      }
      if (progress === 1) {
        void finish()
        return
      }
      animation = requestAnimationFrame(animate)
    }

    drawCover(context, before, false, width, height)
    animation = requestAnimationFrame(animate)
    return () => {
      stopped = true
      cancelAnimationFrame(animation)
    }
  }, [assets, onComplete, request])

  return <canvas ref={canvasRef} className="wallpaper-transition-canvas" aria-label="Applying wallpaper transition" />
}
