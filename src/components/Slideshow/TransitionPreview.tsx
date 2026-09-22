import { useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { LibraryImage } from '../../hooks/useLibrary'
import { drawCover, drawTransition, previewEffects, transitionLabel } from './transitionPreviewEffects'
import './TransitionPreview.css'

interface Props {
  autoPlay?: boolean
  images: LibraryImage[]
  transition: string
  durationSeconds: number
  fps: number
}
interface Asset { path: string, image: HTMLImageElement | null }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => { image.src = ''; reject(new Error('Preview image timed out')) }, 5000)
    image.onload = () => { clearTimeout(timer); resolve(image) }
    image.onerror = () => { clearTimeout(timer); reject(new Error('Preview image unavailable')) }
    image.src = url
  })
}

export function TransitionPreview({ images, transition, durationSeconds, fps, autoPlay = true }: Props) {
  const firstPath = images[0]?.path
  const secondPath = images[1]?.path
  const [assets, setAssets] = useState<Asset[]>([])
  useEffect(() => {
    let cancelled = false
    const paths = [firstPath, secondPath].filter((path): path is string => Boolean(path))
    void Promise.all(paths.map(async path => {
      try {
        const thumbnail = await invoke<string>('generate_thumbnail', { path })
        return { path, image: await loadImage(convertFileSrc(thumbnail)) }
      } catch {
        return { path, image: null }
      }
    })).then(next => { if (!cancelled) setAssets(next) })
    return () => { cancelled = true }
  }, [firstPath, secondPath])

  const pair = useMemo(() => [firstPath, secondPath].map(path => assets.find(asset => asset.path === path)?.image ?? null), [assets, firstPath, secondPath])
  const valid = Number.isFinite(durationSeconds) && durationSeconds >= .1 && durationSeconds <= 30 && Number.isInteger(fps) && fps >= 1 && fps <= 255
  return (
    <aside className="transition-preview" aria-label="Transition preview">
      <div className="transition-preview-heading"><h2>Transition preview</h2><span>Demo</span></div>
      <PreviewCanvas key={`${transition}:${durationSeconds}:${fps}:${firstPath}:${secondPath}`}
        autoPlay={autoPlay} pair={pair} effect={transition} duration={valid ? durationSeconds : 2} fps={valid ? fps : 60} valid={valid} />
      <p className="transition-preview-caption">{pair.every(Boolean) ? 'Using the first two wallpapers in your selection.' : 'Sample landscapes fill in when two wallpapers aren’t available.'}</p>
      <p className="transition-preview-caption">An approximation of the desktop effect. Previewing does not change your wallpaper.</p>
    </aside>
  )
}

function PreviewCanvas({ pair, effect, duration, fps, valid, autoPlay }: {
  autoPlay: boolean,
  pair: (HTMLImageElement | null)[], effect: string, duration: number, fps: number, valid: boolean,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [replay, setReplay] = useState(0)
  const [message, setMessage] = useState('Ready to preview')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', change)
    return () => preference.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const width = canvas.width
    const height = canvas.height
    // Paint each wallpaper once, then animate the two cached surfaces.
    const surfaces = pair.map((image, index) => {
      const surface = document.createElement('canvas')
      surface.width = width
      surface.height = height
      const painter = surface.getContext('2d')
      if (painter) drawCover(painter, image, index === 1, width, height)
      return surface
    })
    const chosen = effect === 'random' ? previewEffects[Math.floor(Math.random() * previewEffects.length)] : effect
    const origin = chosen === 'any' ? { x: Math.random(), y: Math.random() } : { x: .5, y: .5 }
    const label = transitionLabel(chosen)
    let frame = 0
    let started = 0
    let lastFrame = -1
    let stopped = false
    const draw = (progress: number) => drawTransition(context, surfaces[0], surfaces[1], chosen, progress, origin, width, height)
    const animate = (now: number) => {
      if (stopped) return
      if (!started) {
        context.drawImage(surfaces[0], 0, 0)
        if (!valid || ((reducedMotion || !autoPlay) && replay === 0)) {
          setMessage(valid ? 'Press Replay to preview.' : 'Enter a valid duration and frame rate to preview.')
          return
        }
        started = now
        setMessage(`${label} · ${duration}s · ${fps} fps`)
      }
      // A short hold makes the first wallpaper visible before the transition begins.
      const progress = Math.max(0, Math.min(1, (now - started - 450) / (duration * 1000)))
      const frameIndex = Math.floor((now - started) * fps / 1000)
      if (frameIndex !== lastFrame || progress === 1) {
        if (now - started < 450) context.drawImage(surfaces[0], 0, 0)
        else draw(progress)
        lastFrame = frameIndex
      }
      if ((chosen === 'none' && now - started >= 450) || progress === 1) {
        draw(1)
        setMessage(`${label} · Preview complete`)
        return
      }
      frame = requestAnimationFrame(animate)
    }
    // Draw the original image during the initial hold, including for Instant.
    context.drawImage(surfaces[0], 0, 0)
    frame = requestAnimationFrame(animate)
    const stopWhenHidden = () => {
      if (document.hidden) { stopped = true; cancelAnimationFrame(frame); setMessage('Preview paused. Press Replay to restart.') }
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', stopWhenHidden)
    }
  }, [pair, effect, duration, fps, replay, reducedMotion, valid, autoPlay])

  return <>
    <div className="transition-preview-screen"><canvas ref={canvasRef} width="1280" height="720" role="img" aria-label="Animated preview of the selected wallpaper transition" /></div>
    <div className="transition-preview-controls">
      <span role="status">{message}</span>
      <button type="button" disabled={!valid} onClick={() => setReplay(value => value + 1)}>Replay preview</button>
    </div>
  </>
}
