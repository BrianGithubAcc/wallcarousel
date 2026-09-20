import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  invoke,
} from '@tauri-apps/api/core'

import {
  getCurrentWindow,
} from '@tauri-apps/api/window'

import {
  Carousel,
} from '../Carousel/Carousel'

import type {
  CarouselItem,
} from '../Carousel/Carousel'

import {
  CAROUSEL_CONFIGURATION_KEY,
  loadCarouselConfiguration,
} from '../Carousel/carouselConfiguration'

import {
  useLibrary,
} from '../../hooks/useLibrary'

import {
  usePlaylists,
} from '../../hooks/usePlaylists'

import './WallpaperOverlay.css'

export function WallpaperOverlay() {
  /*
   * The overlay WebView is hidden and reused by
   * Tauri. Keep the configuration live instead
   * of retaining the value from its first mount.
   */
  const [
    carouselConfiguration,
    setCarouselConfiguration,
  ] = useState(
    loadCarouselConfiguration,
  )

  const library =
    useLibrary()

  const playlists =
    usePlaylists()

  /*
   * Infinite overlay position is deliberately
   * independent from the finite editor
   * useCarousel() hook.
   */
  const positionRef =
    useRef(
      0,
    )

  const [
    selecting,
    setSelecting,
  ] = useState(
    false,
  )

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    )

  useEffect(() => {
    let disposed = false
    let unlistenFocus: (() => void) | undefined

    const refreshConfiguration = () => {
      setCarouselConfiguration(
        loadCarouselConfiguration(),
      )

      positionRef.current =
        0
    }

    const handleStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.key === null ||
        event.key === CAROUSEL_CONFIGURATION_KEY
      ) {
        refreshConfiguration()
      }
    }

    window.addEventListener(
      'storage',
      handleStorage,
    )

    try {
      void getCurrentWindow()
        .onFocusChanged(
          ({ payload: focused }) => {
            if (focused) {
              refreshConfiguration()
            }
          },
        )
        .then((cleanup) => {
          if (disposed) {
            cleanup()
          } else {
            unlistenFocus = cleanup
          }
        })
        .catch(() => {
          // Browser-only development has no Tauri window events.
        })
    } catch {
      // Browser-only development has no Tauri window events.
    }

    return () => {
      disposed = true

      window.removeEventListener(
        'storage',
        handleStorage,
      )

      unlistenFocus?.()
    }
  }, [])

  const images =
    useMemo(
      () => {
        const selected =
          playlists.selectedPlaylist

        if (
          !selected
        ) {
          return library.images
        }

        return selected.imageIds
          .map(
            (
              id,
            ) =>
              library.images.find(
                (
                  image,
                ) =>
                  image.id ===
                  id,
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

  const items =
    useMemo<
      CarouselItem[]
    >(
      () =>
        images.map(
          (
            image,
          ) => ({
            id:
              image.id,

            label:
              image.name,

            path:
              image.path,
          }),
        ),
      [
        images,
      ],
    )

  const handleScroll =
    useCallback(
      (
        amount:
          number,
      ) => {
        if (
          selecting
        ) {
          return
        }

        positionRef.current +=
          amount
      },
      [
        selecting,
      ],
    )

  const closeOverlay =
    useCallback(
      async () => {
        try {
          await invoke(
            'close_wallpaper_overlay',
          )
        } catch (
          closeError
        ) {
          console.error(
            closeError,
          )
        }
      },
      [],
    )

  const selectWallpaper =
    useCallback(
      async (
        item:
          CarouselItem,
      ) => {
        if (
          selecting
        ) {
          return
        }

        setSelecting(
          true,
        )

        setError(
          null,
        )

        try {
          await invoke(
            'set_wallpaper',
            {
              path:
                item.path,
            },
          )

          /*
           * Rust closes the overlay after a
           * successful awww command.
           */
        } catch (
          commandError
        ) {
          const message =
            commandError instanceof
            Error
              ? commandError.message
              : String(
                  commandError,
                )

          setError(
            message,
          )

          setSelecting(
            false,
          )
        }
      },
      [
        selecting,
      ],
    )

  useEffect(() => {
    const handleKeyDown =
      (
        event:
          KeyboardEvent,
      ) => {
        if (
          event.key ===
          'Escape'
        ) {
          event.preventDefault()

          void closeOverlay()
        }
      }

    window.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      )
    }
  }, [
    closeOverlay,
  ])

  return (
    <main className="wallpaper-overlay-root">
      <div className="wallpaper-overlay-dimmer" />

      <div className="wallpaper-overlay-header">
        <strong>
          Wallpaper Carousel
        </strong>

        <span>
          Scroll to browse · click a wallpaper to apply · Esc to cancel
        </span>
      </div>

      {
        items.length >
        0 ? (
          <div className="wallpaper-overlay-carousel">
            <Carousel
              items={
                items
              }
              positionRef={
                positionRef
              }
              equation={
                carouselConfiguration
                  .equation
              }
              onScroll={
                handleScroll
              }
              fadeAmount={
                carouselConfiguration
                  .fadeAmount
              }
              centerPoint={
                carouselConfiguration
                  .centerPoint
              }
              minBrightness={
                carouselConfiguration
                  .minBrightness
              }
              brightnessSoftening={
                carouselConfiguration
                  .brightnessSoftening
              }
              infiniteScroll={
                carouselConfiguration
                  .infiniteScroll
              }
              closedLoop={
                carouselConfiguration
                  .closedLoop
              }
              cardOrientation={
                carouselConfiguration
                  .cardOrientation
              }
              transparentBackground={
                true
              }
              persistConfiguration={
                false
              }
              onItemClick={
                selectWallpaper
              }
            />
          </div>
        ) : (
          <div className="wallpaper-overlay-empty">
            <strong>
              No wallpapers
            </strong>

            <span>
              Add wallpapers to the library or selected playlist first.
            </span>
          </div>
        )
      }

      <div className="wallpaper-overlay-footer">
        {
          selecting ? (
            <span>
              Applying wallpaper…
            </span>
          ) : (
            <>
              <span>
                {
                  playlists.selectedPlaylist
                    ?.name ??
                  'All wallpapers'
                }
              </span>

              <span>
                {
                  items.length
                }{' '}
                {
                  items.length ===
                  1
                    ? 'wallpaper'
                    : 'wallpapers'
                }
              </span>
            </>
          )
        }
      </div>

      {
        error && (
          <div className="wallpaper-overlay-error">
            <strong>
              Could not set wallpaper
            </strong>

            <span>
              {
                error
              }
            </span>
          </div>
        )
      }
    </main>
  )
}
