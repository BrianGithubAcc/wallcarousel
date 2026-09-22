import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { LibraryImage } from '../../hooks/useLibrary'
import type { Playlist } from '../../hooks/usePlaylists'
import { TransitionPreview } from '../Slideshow/TransitionPreview'
import { macOSPreviewEffects, transitionLabel } from '../Slideshow/transitionPreviewEffects'
import './SlideshowPage.css'

interface Config {
  playlistId: string | null
  paths: string[]
  intervalSeconds: number
  shuffle: boolean
  transition: string
  durationSeconds: number
  fps: number
}
interface Status {
  config: Config
  running: boolean
  currentPath: string | null
  error: string | null
  remainingSeconds: number | null
}
const linuxEffects = ['fade', 'left', 'right', 'top', 'bottom', 'wipe', 'wave', 'grow', 'center', 'any', 'outer', 'random', 'none']
const intervalUnits = { seconds: 1, minutes: 60, hours: 3600 }
type IntervalUnit = keyof typeof intervalUnits
const intervalUnitKey = 'wallcarousel.slideshow.interval-unit.v1'

export function SlideshowPage({ images, playlists, autoPreview = true }: { images: LibraryImage[], playlists: Playlist[], autoPreview?: boolean }) {
  const isMacOS = typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(`${navigator.userAgent} ${navigator.platform}`)
  const effects = isMacOS ? macOSPreviewEffects : linuxEffects
  const [config, setConfig] = useState<Config | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [selectedIntervalUnit, setSelectedIntervalUnit] = useState<IntervalUnit | null>(() => {
    try {
      const saved = localStorage.getItem(intervalUnitKey)
      return saved === 'seconds' || saved === 'minutes' || saved === 'hours' ? saved : null
    } catch { return null }
  })
  const intervalUnit = selectedIntervalUnit ?? (
    config && config.intervalSeconds % 3600 === 0 ? 'hours'
      : config && config.intervalSeconds % 60 === 0 ? 'minutes' : 'seconds'
  )
  const intervalMultiplier = intervalUnits[intervalUnit]
  const intervalValue = config ? config.intervalSeconds / intervalMultiplier : 0

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await invoke<Status>('slideshow_status')
        if (!disposed) {
          setStatus(next)
          setConfig(current => current ?? next.config)
        }
      } catch (cause) {
        if (!disposed) setError(String(cause))
      } finally {
        if (!disposed) timer = setTimeout(() => { void refresh() }, 1000)
      }
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [])

  const playlistId = config?.playlistId
  const sourceImages = useMemo(() => {
    if (!playlistId) return images
    const playlist = playlists.find(p => p.id === playlistId)
    const byId = new Map(images.map(image => [image.id, image]))
    return (playlist?.imageIds ?? []).flatMap(id => {
      const image = byId.get(id)
      return image ? [image] : []
    })
  }, [playlistId, images, playlists])

  function update(patch: Partial<Config>) {
    setConfig(current => current ? { ...current, ...patch } : current)
    setNotice('Unsaved changes')
  }

  async function control(action: 'save' | 'start' | 'pause' | 'next') {
    if (!config || busy) return
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      const next = await invoke<Status>('slideshow_control', {
        action,
        config: action === 'pause' ? null : { ...config, paths: sourceImages.map(image => image.path) },
      })
      setStatus(next)
      if (action !== 'pause') setConfig(next.config)
      setNotice(next.error ? '' : action === 'save' ? 'Settings saved and applied.' : '')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const valid = config && Number.isInteger(config.intervalSeconds) && config.intervalSeconds >= 5 && config.intervalSeconds <= 86400
    && Number.isFinite(config.durationSeconds) && config.durationSeconds >= 0.1 && config.durationSeconds <= 30
    && config.durationSeconds < config.intervalSeconds && Number.isInteger(config.fps) && config.fps >= 1 && config.fps <= 255
  const missingPlaylist = config?.playlistId && !playlists.some(p => p.id === config.playlistId)

  return (
    <section className="page slideshow-page">
      <header className="page-header">
        <div><h1>Slideshow</h1><p className="page-subtitle">Let your wallpapers change throughout the day.</p></div>
        <span className={`slideshow-badge ${status?.running ? 'running' : ''}`}>{status?.running ? 'Playing' : 'Paused'}</span>
      </header>
      <div className="slideshow-content">
        {(error || status?.error) && <p className="slideshow-error" role="alert">{error || status?.error}</p>}
        {!config ? <p>Loading slideshow settings…</p> : <>
          <div className="slideshow-editor">
          <form onSubmit={event => { event.preventDefault(); void control('save') }}>
            <fieldset disabled={busy}>
              <legend>Wallpaper source</legend>
              <label>Playlist
                <select value={config.playlistId ?? ''} onChange={event => update({ playlistId: event.target.value || null })}>
                  <option value="">All library images</option>
                  {missingPlaylist && <option value={config.playlistId!}>Deleted playlist — select another</option>}
                  {playlists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                </select>
              </label>
              <p className="slideshow-hint">{sourceImages.length} wallpapers. {sourceImages.length === 0 ? 'Add images in Library or choose another playlist.' : 'Playlist order is used unless shuffle is enabled.'}</p>
              <label className="slideshow-check"><input type="checkbox" checked={config.shuffle} onChange={event => update({ shuffle: event.target.checked })} /> Shuffle wallpapers</label>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Timing & transition</legend>
              <div className="slideshow-fields">
                <div className="slideshow-interval">
                  <label htmlFor="slideshow-interval-value">Change every</label>
                  <div className="slideshow-interval-inputs">
                    <input id="slideshow-interval-value" type="number" min={5 / intervalMultiplier}
                      max={86400 / intervalMultiplier} step="any" required
                      value={Number.isFinite(intervalValue) ? intervalValue : ''}
                      onChange={event => {
                        setSelectedIntervalUnit(intervalUnit)
                        update({ intervalSeconds: Math.round(event.target.valueAsNumber * intervalMultiplier) })
                      }} />
                    <select aria-label="Slideshow interval unit" value={intervalUnit} onChange={event => {
                      const unit = event.target.value as IntervalUnit
                      setSelectedIntervalUnit(unit)
                      update({ intervalSeconds: Math.round(intervalValue * intervalUnits[unit]) })
                      try { localStorage.setItem(intervalUnitKey, unit) } catch { /* Keep the control usable if storage is unavailable. */ }
                    }}>
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                </div>
                <label>Transition effect{isMacOS ? ' (preview only on macOS)' : ''}
                  <select value={config.transition} onChange={event => update({ transition: event.target.value })}>
                    {effects.map(effect => <option key={effect} value={effect}>{transitionLabel(effect)}</option>)}
                  </select>
                </label>
                <label>Transition duration (seconds)
                  <input type="number" min="0.1" max="30" step="0.1" required value={config.durationSeconds} onChange={event => update({ durationSeconds: event.target.valueAsNumber })} />
                </label>
                <label>Transition frame rate
                  <input type="number" min="1" max="255" step="1" required value={config.fps} onChange={event => update({ fps: event.target.valueAsNumber })} />
                </label>
              </div>
              <p className="slideshow-hint">{isMacOS ? 'macOS applies wallpaper changes immediately. Select an effect to preview it here; duration and frame rate control the preview.' : 'Choose an interval from 5 seconds to 24 hours. Transitions must be shorter than this interval.'}</p>
            </fieldset>
            <div className="slideshow-actions">
              <button type="submit" disabled={busy || !valid || Boolean(missingPlaylist)}>Save settings</button>
              <button className="slideshow-primary" type="button" disabled={busy || (!status?.running && (!valid || sourceImages.length === 0))} onClick={() => { void control(status?.running ? 'pause' : 'start') }}>{status?.running ? 'Pause' : 'Start slideshow'}</button>
              <button type="button" disabled={busy || !valid || sourceImages.length === 0} onClick={() => { void control('next') }}>Next wallpaper</button>
            </div>
          <div className="slideshow-status" aria-live="polite">
            {notice && <p>{notice}</p>}
            <p>{status?.currentPath ? `Current: ${status.currentPath.split('/').pop()}` : 'Start the slideshow or use Next wallpaper to apply a wallpaper to your desktop.'}</p>
            {status?.running && <p>Next wallpaper in approximately {status.remainingSeconds ?? 0} seconds.</p>}
          </div>
          <p className="slideshow-hint">Playback continues in the tray and changes all displays. Settings are saved when you start, use Next wallpaper, or save. Save again after editing a playlist to update the running slideshow. Quitting stops playback; reopen this tab to start again.</p>
          </form>
          <TransitionPreview autoPlay={autoPreview} images={sourceImages} transition={config.transition}
            durationSeconds={config.durationSeconds} fps={config.fps} />
          </div>

        </>}
      </div>
    </section>
  )
}
