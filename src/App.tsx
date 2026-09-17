import {
  useCallback,
  useMemo,
  useState,
} from 'react'

import {
  AppTabs,
} from './components/Layout/AppTabs'

import type {
  AppTab,
} from './components/Layout/AppTabs'

import {
  ImagesPage,
} from './components/Pages/ImagesPage'

import {
  CarouselPage,
} from './components/Pages/CarouselPage'

import {
  SettingsPage,
} from './components/Pages/SettingsPage'

import {
  useCarousel,
} from './components/Carousel/useCarousel'

import {
  useLibrary,
} from './hooks/useLibrary'

import {
  usePlaylists,
} from './hooks/usePlaylists'

import { loadPreferences, savePreferences } from './settings/preferences'
import type { Preferences } from './settings/preferences'
import './App.css'
import { SlideshowPage } from './components/Pages/SlideshowPage'

function App() {
  const [preferences, setPreferences] = useState(loadPreferences)
  function changePreferences(value: Preferences) {
    savePreferences(value)
    setPreferences(value)
  }
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<AppTab>(
      preferences.openingTab,
    )

  const library =
    useLibrary()

  const playlists =
    usePlaylists()

  const carouselImages =
    useMemo(
      () => {
        const selected =
          playlists.selectedPlaylist

        if (!selected) {
          return library.images
        }

        return selected.imageIds
          .map(
            (id) =>
              library.images.find(
                (image) =>
                  image.id === id,
              ),
          )
          .filter(
            (
              image,
            ): image is typeof library.images[number] =>
              image !==
              undefined,
          )
      },
      [
        library.images,
        playlists.selectedPlaylist,
      ],
    )

  const carousel =
    useCarousel(
      carouselImages.length,
    )

  const handleImagesSelected =
    useCallback(
      (
        paths: string[],
      ) => {
        library.addImages(
          paths,
        )
      },
      [
        library.addImages,
      ],
    )

  const handleScroll =
    useCallback(
      (
        amount: number,
      ) => {
        carousel.scroll(
          amount,
        )
      },
      [
        carousel.scroll,
      ],
    )

  return (
    <main className="app">
      <AppTabs
        activeTab={
          activeTab
        }
        onChange={
          setActiveTab
        }
      />

      <div className="app-content">
        {activeTab === 'slideshow' && (
          <SlideshowPage images={library.images} playlists={playlists.playlists} autoPreview={preferences.autoPreview} />
        )}
        {
          activeTab ===
            'images' && (
            <ImagesPage
              images={
                library.images
              }
              playlists={
                playlists.playlists
              }
              selectedPlaylistId={
                playlists.selectedPlaylistId
              }
              onSelectPlaylist={
                playlists.setSelectedPlaylistId
              }
              onCreatePlaylist={
                playlists.createPlaylist
              }
              onDeletePlaylist={
                playlists.deletePlaylist
              }
              onAddImageToPlaylist={
                playlists.addImageToPlaylist
              }
              onRemoveImageFromPlaylist={
                playlists.removeImageFromPlaylist
              }
              onImagesSelected={
                handleImagesSelected
              }
            />
          )
        }

        {
          activeTab ===
            'carousel' && (
            <CarouselPage
              showEquationGraph={preferences.showEquationGraph}
              images={
                carouselImages
              }
              playlists={
                playlists.playlists
              }
              selectedPlaylistId={
                playlists.selectedPlaylistId
              }
              onSelectPlaylist={
                playlists.setSelectedPlaylistId
              }
              positionRef={
                carousel.positionRef
              }
              onScroll={
                handleScroll
              }
            />
          )
        }

        {
          activeTab ===
            'settings' && (
            <SettingsPage preferences={preferences} onChange={changePreferences} onNavigate={setActiveTab}
              imageCount={library.images.length} playlistCount={playlists.playlists.length} />
          )
        }
      </div>
    </main>
  )
}

export default App
