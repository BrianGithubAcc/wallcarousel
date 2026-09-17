import { useState } from 'react'
import type { AppTab } from '../Layout/AppTabs'
import { defaultPreferences } from '../../settings/preferences'
import type { Preferences } from '../../settings/preferences'
import './SettingsPage.css'

interface Props {
  preferences: Preferences
  onChange: (value: Preferences) => void
  onNavigate: (tab: AppTab) => void
  imageCount: number
  playlistCount: number
}

export function SettingsPage({ preferences, onChange, onNavigate, imageCount, playlistCount }: Props) {
  const [message, setMessage] = useState('')
  function update(patch: Partial<Preferences>) {
    try { onChange({ ...preferences, ...patch }); setMessage('Preferences saved.') }
    catch { setMessage('Could not save preferences. Please try again.') }
  }
  return (
    <section className="page settings-page">
      <header className="page-header"><div><h1>Settings</h1><p className="page-subtitle">Make Wallcarousel feel at home on your desktop.</p></div></header>
      <div className="settings-dashboard">
        <section className="settings-card settings-preferences">
          <h2>App preferences</h2><p>Changes apply immediately and are remembered.</p>
          <label className="settings-field">Opening tab
            <select value={preferences.openingTab} onChange={event => update({ openingTab: event.target.value as AppTab })}>
              <option value="images">Library</option><option value="carousel">Carousel</option><option value="slideshow">Slideshow</option><option value="settings">Settings</option>
            </select>
            <span>The page shown when the application starts.</span>
          </label>
          <label className="settings-toggle"><input type="checkbox" checked={preferences.autoPreview} onChange={event => update({ autoPreview: event.target.checked })} /><span>Play transition demos automatically<small>Preview changes as you adjust settings. Reduced motion preferences are respected.</small></span></label>
          <label className="settings-toggle"><input type="checkbox" checked={preferences.showEquationGraph} onChange={event => update({ showEquationGraph: event.target.checked })} /><span>Show the equation graph<small>Turn off to give the carousel preview the full available height.</small></span></label>
          <button type="button" onClick={() => update(defaultPreferences)}>Restore app preferences</button>
          <p className="settings-feedback" role="status">{message}</p>
        </section>
        <section className="settings-card">
          <h2>Your collection</h2><p>Wallpapers and playlists available in this library.</p>
          <div className="settings-stats"><div><strong>{imageCount}</strong><span>Wallpapers</span></div><div><strong>{playlistCount}</strong><span>Playlists</span></div></div>
          <button type="button" onClick={() => onNavigate('images')}>Manage library</button>
          <div className="settings-divider" />
          <h3>Wallpaper controls</h3>
          <p>Arrange your wallpaper picker or set up automatic changes.</p>
          <div className="settings-links"><button type="button" onClick={() => onNavigate('carousel')}>Configure carousel</button><button type="button" onClick={() => onNavigate('slideshow')}>Configure slideshow</button></div>
        </section>
        <section className="settings-card">
          <h2>Desktop behaviour</h2>
          <dl className="settings-details">
            <div><dt>Close the window</dt><dd>The app stays in the tray. A playing slideshow keeps running.</dd></div>
            <div><dt>Quit the app</dt><dd>Choose Quit in the tray menu. Slideshow settings are restored paused next time.</dd></div>
            <div><dt>Apply a wallpaper</dt><dd>AWWW changes the wallpaper on all connected displays.</dd></div>
          </dl>
        </section>
        <section className="settings-card settings-launch">
          <h2>Launch & shortcuts</h2><p>Use these commands in your desktop launcher, startup configuration, or keyboard shortcuts.</p>
          <div className="settings-commands"><div><code>wallcarousel</code><span>Open the app</span></div><div><code>wallcarousel --background</code><span>Start in the tray</span></div><div><code>wallcarousel --overlay</code><span>Open the wallpaper picker</span></div></div>
          <p>Carousel appearance saves automatically. Slideshow controls save when you choose Save settings, Start, or Next wallpaper.</p>
        </section>
      </div>
    </section>
  )
}
