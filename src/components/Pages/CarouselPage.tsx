import {
  useMemo,
  useState,
} from 'react'

import type {
  RefObject,
} from 'react'

import {
  Carousel,
} from '../Carousel/Carousel'

import {
  EquationGraph,
} from '../Carousel/EquationGraph'

import {
  CarouselSettingsCard,
} from './CarouselSettingsCard'

import {
  CAROUSEL_PRESETS,
  CAROUSEL_PRESET_GROUPS,
  findMatchingCarouselPreset,
  getCarouselPreset,
} from '../Carousel/carouselPresets'

import type {
  CarouselPreset,
} from '../Carousel/carouselPresets'

import {
  DEFAULT_CAROUSEL_CONFIGURATION,
  loadCarouselConfiguration,
} from '../Carousel/carouselConfiguration'

import type {
  LibraryImage,
} from '../../hooks/useLibrary'

import type {
  Playlist,
} from '../../hooks/usePlaylists'

import type {
  ParametricEquation,
  Point3,
} from '../Carousel/parametricEquation'

import type {
  CarouselCardOrientation,
} from '../Carousel/carousel.types'

import {
  DEFAULT_CAROUSEL_VIEW_ASPECT,
} from '../Carousel/carouselView'

import './CarouselPage.css'


interface CarouselPageProps {
  showEquationGraph?: boolean
  images:
    LibraryImage[]

  playlists:
    Playlist[]

  selectedPlaylistId:
    string | null

  onSelectPlaylist: (
    id:
      string | null,
  ) => void

  positionRef:
    RefObject<number>

  onScroll: (
    amount:
      number,
  ) => void
}


export function CarouselPage({
  showEquationGraph = true,
  images,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  positionRef,
  onScroll,
}: CarouselPageProps) {
  /*
   * Restore the actual carousel that was
   * previously active instead of replacing
   * it with defaults every time this page
   * mounts.
   */
  const [
    carouselViewAspect,
    setCarouselViewAspect,
  ] = useState(
    DEFAULT_CAROUSEL_VIEW_ASPECT,
  )

  const initialConfiguration =
    useMemo(
      () =>
        loadCarouselConfiguration(),
      [],
    )


  const initialPreset =
    useMemo(
      () =>
        findMatchingCarouselPreset(
          initialConfiguration
            .equation,

          initialConfiguration
            .closedLoop,
        ),
      [
        initialConfiguration,
      ],
    )


  const [
    presetId,
    setPresetId,
  ] = useState(
    initialPreset?.id ??
      'custom',
  )


  const [
    equation,
    setEquation,
  ] =
    useState<ParametricEquation>(
      () => ({
        ...initialConfiguration
          .equation,
      }),
    )


  const [
    centerPoint,
    setCenterPoint,
  ] =
    useState<Point3>(
      () => ({
        ...initialConfiguration
          .centerPoint,
      }),
    )


  const [
    fadeAmount,
    setFadeAmount,
  ] = useState(
    initialConfiguration
      .fadeAmount,
  )


  const [
    minBrightness,
    setMinBrightness,
  ] = useState(
    initialConfiguration
      .minBrightness,
  )


  const [
    brightnessSoftening,
    setBrightnessSoftening,
  ] = useState(
    initialConfiguration
      .brightnessSoftening,
  )


  const [
    infiniteScroll,
    setInfiniteScroll,
  ] = useState(
    initialConfiguration
      .infiniteScroll,
  )


  const [
    closedLoop,
    setClosedLoop,
  ] = useState(
    initialConfiguration
      .closedLoop,
  )

  const [
    cardOrientation,
    setCardOrientation,
  ] = useState<CarouselCardOrientation>(
    initialConfiguration
      .cardOrientation,
  )


  const [
    showCurve,
    setShowCurve,
  ] = useState(
    true,
  )


  const [
    showPlane,
    setShowPlane,
  ] = useState(
    true,
  )


  const [
    showGrid,
    setShowGrid,
  ] = useState(
    true,
  )


  const [
    lineColor,
    setLineColor,
  ] = useState(
    '#ffffff',
  )


  const [
    lineWidth,
    setLineWidth,
  ] = useState(
    3,
  )


  const carouselItems =
    useMemo(
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


  const selectedPlaylistName =
    useMemo(
      () => {
        if (
          !selectedPlaylistId
        ) {
          return 'All wallpapers'
        }

        return (
          playlists.find(
            (
              playlist,
            ) =>
              playlist.id ===
              selectedPlaylistId,
          )?.name ??
          'Selected playlist'
        )
      },
      [
        playlists,
        selectedPlaylistId,
      ],
    )


  const activePreset =
    presetId ===
      'custom'
      ? null
      : getCarouselPreset(
          presetId,
        )


  function applyPreset(
    preset:
      CarouselPreset,
  ) {
    setPresetId(
      preset.id,
    )

    setEquation({
      ...preset.equation,
    })

    setClosedLoop(
      preset.closedLoop,
    )

    /*
     * Screen Coil is a continuously repeating
     * synchronized path.
     *
     * Basic presets start with ordinary finite
     * scrolling; the user can turn infinite
     * scrolling back on manually if desired.
     */
    setInfiniteScroll(
      false,
    )

    /*
     * Start new preset from the beginning.
     */
    positionRef.current =
      0
  }


  function selectPreset(
    id:
      string,
  ) {
    if (
      id ===
      'custom'
    ) {
      setPresetId(
        'custom',
      )

      return
    }

    const preset =
      getCarouselPreset(
        id,
      )

    if (
      preset
    ) {
      applyPreset(
        preset,
      )
    }
  }



  function updateEquationField(
    key:
      keyof ParametricEquation,

    value:
      string,
  ) {
    setPresetId(
      'custom',
    )

    setEquation(
      (
        current,
      ) => ({
        ...current,

        [key]:
          value,
      }),
    )
  }


  function updateCenterPoint(
    key:
      keyof Point3,

    value:
      number,
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return
    }

    setCenterPoint(
      (
        current,
      ) => ({
        ...current,

        [key]:
          value,
      }),
    )
  }


  function resetSettings() {
    const defaults =
      DEFAULT_CAROUSEL_CONFIGURATION

    setEquation({
      ...defaults.equation,
    })

    setCenterPoint({
      ...defaults.centerPoint,
    })

    setFadeAmount(
      defaults.fadeAmount,
    )

    setMinBrightness(
      defaults.minBrightness,
    )

    setBrightnessSoftening(
      defaults
        .brightnessSoftening,
    )

    setInfiniteScroll(
      defaults.infiniteScroll,
    )

    setClosedLoop(
      defaults.closedLoop,
    )

    setCardOrientation(
      defaults.cardOrientation,
    )

    const preset =
      findMatchingCarouselPreset(
        defaults.equation,
        defaults.closedLoop,
      )

    setPresetId(
      preset?.id ??
        'custom',
    )

    setShowCurve(
      true,
    )

    setShowPlane(
      true,
    )

    setShowGrid(
      true,
    )

    setLineColor(
      '#ffffff',
    )

    setLineWidth(
      3,
    )

    positionRef.current =
      0
  }


  return (
    <section className="wc-carousel-page">
      <header className="wc-page-header">
        <div>
          <h1>
            Carousel
          </h1>

          <p className="wc-page-subtitle">
            Preview and configure your
            wallpaper carousel.
          </p>
        </div>
      </header>


      <div className="wc-carousel-layout">

        <div className={`wc-carousel-left ${showEquationGraph ? "" : "wc-preview-only"}`}>

          <section className="wc-preview-card">
            <header className="wc-panel-header">
              <div>
                <h2>
                  Preview
                </h2>

                <p>
                  Live carousel preview
                </p>
              </div>

              <div className="wc-panel-badge">
                {
                  carouselItems.length
                }{' '}
                {
                  carouselItems.length ===
                  1
                    ? 'wallpaper'
                    : 'wallpapers'
                }
              </div>
            </header>


            <div className="wc-preview-surface">
              {
                carouselItems.length ===
                0 ? (
                  <div className="wc-empty-state">
                    <h3>
                      No wallpapers selected
                    </h3>

                    <p>
                      Choose a playlist or
                      All wallpapers.
                    </p>
                  </div>
                ) : (
                  <Carousel
                    items={
                      carouselItems
                    }

                    positionRef={
                      positionRef
                    }

                    onScroll={
                      onScroll
                    }

                    equation={
                      equation
                    }

                    fadeAmount={
                      fadeAmount
                    }

                    centerPoint={
                      centerPoint
                    }

                    minBrightness={
                      minBrightness
                    }

                    brightnessSoftening={
                      brightnessSoftening
                    }

                    infiniteScroll={
                      infiniteScroll
                    }

                    closedLoop={
                      closedLoop
                    }

                    cardOrientation={
                      cardOrientation
                    }

                    onViewAspectChange={
                      setCarouselViewAspect
                    }
                  />
                )
              }
            </div>
          </section>


          {showEquationGraph && <section className="wc-graph-card">
            <header className="wc-panel-header">
              <div>
                <h2>
                  Equation Graph
                </h2>

                <p>
                  Click graph · WASD camera ·
                  drag XYZ arrows to move light
                </p>
              </div>

              <div className="wc-panel-badge">
                {
                  activePreset?.label ??
                  'Custom'
                }
              </div>
            </header>


            <div className="wc-graph-surface">
              <EquationGraph
                equation={
                  equation
                }

                imageCount={
                  carouselItems.length
                }

                viewAspect={
                  carouselViewAspect
                }

                positionRef={
                  positionRef
                }

                centerPoint={
                  centerPoint
                }

                onCenterPointChange={
                  setCenterPoint
                }

                infiniteScroll={
                  infiniteScroll
                }

                closedLoop={
                  closedLoop
                }

                showCurve={
                  showCurve
                }

                showPlane={
                  showPlane
                }

                showGrid={
                  showGrid
                }

                lineColor={
                  lineColor
                }

                lineWidth={
                  lineWidth
                }
              />
            </div>
          </section>}

        </div>


        <aside className="wc-settings-panel">

          <CarouselSettingsCard
            title="Playlist"

            subtitle="Wallpapers used by the carousel."
          >
            <div className="wc-field">
              <label className="wc-label">
                Playlist
              </label>

              <select
                className="wc-select"

                value={
                  selectedPlaylistId ??
                  ''
                }

                onChange={
                  (
                    event,
                  ) =>
                    onSelectPlaylist(
                      event.target.value ===
                        ''
                        ? null
                        : event.target.value,
                    )
                }
              >
                <option value="">
                  All wallpapers
                </option>

                {
                  playlists.map(
                    (
                      playlist,
                    ) => (
                      <option
                        key={
                          playlist.id
                        }

                        value={
                          playlist.id
                        }
                      >
                        {
                          playlist.name
                        }
                      </option>
                    ),
                  )
                }
              </select>
            </div>


            <div className="wc-toggle-row">
              <label className="wc-checkbox">
                <input
                  type="checkbox"

                  checked={
                    infiniteScroll
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setInfiniteScroll(
                        event.target
                          .checked,
                      )
                  }
                />

                <span>
                  Infinite scroll
                </span>
              </label>


              <label className="wc-checkbox">
                <input
                  type="checkbox"

                  checked={
                    closedLoop
                  }

                  onChange={
                    (
                      event,
                    ) => {
                      setClosedLoop(
                        event.target
                          .checked,
                      )

                      /*
                       * Manual change means it
                       * is no longer exactly
                       * the named preset.
                       */
                      setPresetId(
                        'custom',
                      )
                    }
                  }
                />

                <span>
                  Closed loop
                </span>
              </label>
            </div>


            <div className="wc-info-chip">
              Active source:{' '}

              <strong>
                {
                  selectedPlaylistName
                }
              </strong>
            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Carousel Shape"

            subtitle="Choose a path preset or edit the equations manually."

            actions={
              <button
                type="button"

                className="wc-ghost-button"

                onClick={
                  resetSettings
                }
              >
                Reset
              </button>
            }
          >

            <div className="wc-field">
              <label className="wc-label">
                Preset
              </label>


              <select
                className="wc-select wc-preset-select"

                value={
                  presetId
                }

                onChange={
                  (
                    event,
                  ) =>
                    selectPreset(
                      event.target.value,
                    )
                }
              >
                <option value="custom">
                  Custom
                </option>

                {
                  CAROUSEL_PRESET_GROUPS.map(
                    (
                      group,
                    ) => (
                      <optgroup
                        key={
                          group
                        }

                        label={
                          group
                        }
                      >
                        {
                          CAROUSEL_PRESETS
                            .filter(
                              (
                                preset,
                              ) =>
                                preset.group ===
                                group,
                            )
                            .map(
                              (
                                preset,
                              ) => (
                                <option
                                  key={
                                    preset.id
                                  }

                                  value={
                                    preset.id
                                  }
                                >
                                  {
                                    preset.label
                                  }
                                </option>
                              ),
                            )
                        }
                      </optgroup>
                    ),
                  )
                }
              </select>
            </div>


            <div className="wc-preset-description">
              <strong>
                {
                  activePreset?.label ??
                  'Custom equation'
                }
              </strong>

              <span>
                {
                  activePreset
                    ?.description ??
                  'Edit X(t), Y(t) and Z(t) below to create your own path.'
                }
              </span>
            </div>

            <div className="wc-field">
              <label className="wc-label">
                Card orientation
              </label>

              <select
                className="wc-select"
                value={cardOrientation}
                onChange={(event) => setCardOrientation(event.target.value as CarouselCardOrientation)}
              >
                <option value="camera">
                  Face camera
                </option>

                <option value="grid">
                  Align to grid
                </option>
              </select>
            </div>


            <div className="wc-equation-grid">

              <div className="wc-field">
                <label className="wc-label">
                  X(t)
                </label>

                <input
                  className="wc-input wc-equation-input"

                  type="text"

                  value={
                    equation.x
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateEquationField(
                        'x',
                        event.target.value,
                      )
                  }

                  spellCheck={
                    false
                  }
                />
              </div>


              <div className="wc-field">
                <label className="wc-label">
                  Y(t)
                </label>

                <input
                  className="wc-input wc-equation-input"

                  type="text"

                  value={
                    equation.y
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateEquationField(
                        'y',
                        event.target.value,
                      )
                  }

                  spellCheck={
                    false
                  }
                />
              </div>


              <div className="wc-field wc-field-full">
                <label className="wc-label">
                  Z(t)
                </label>

                <input
                  className="wc-input wc-equation-input"

                  type="text"

                  value={
                    equation.z
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateEquationField(
                        'z',
                        event.target.value,
                      )
                  }

                  spellCheck={
                    false
                  }
                />
              </div>

            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Light Source"

            subtitle="Move it here or drag the XYZ handles in the graph."
          >
            <div className="wc-number-grid">

              <div className="wc-field">
                <label className="wc-label">
                  X
                </label>

                <input
                  className="wc-input"

                  type="number"

                  step="0.1"

                  value={
                    centerPoint.x
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateCenterPoint(
                        'x',

                        Number(
                          event.target.value,
                        ),
                      )
                  }
                />
              </div>


              <div className="wc-field">
                <label className="wc-label">
                  Y
                </label>

                <input
                  className="wc-input"

                  type="number"

                  step="0.1"

                  value={
                    centerPoint.y
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateCenterPoint(
                        'y',

                        Number(
                          event.target.value,
                        ),
                      )
                  }
                />
              </div>


              <div className="wc-field">
                <label className="wc-label">
                  Z
                </label>

                <input
                  className="wc-input"

                  type="number"

                  step="0.1"

                  value={
                    centerPoint.z
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      updateCenterPoint(
                        'z',

                        Number(
                          event.target.value,
                        ),
                      )
                  }
                />
              </div>

            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Brightness"

            subtitle="Control the simulated light falloff."
          >
            <div className="wc-field">
              <div className="wc-range-header">
                <label className="wc-label">
                  Minimum brightness
                </label>

                <span className="wc-value">
                  {
                    minBrightness.toFixed(
                      2,
                    )
                  }
                </span>
              </div>

              <input
                className="wc-range"

                type="range"

                min="0"

                max="1"

                step="0.01"

                value={
                  minBrightness
                }

                onChange={
                  (
                    event,
                  ) =>
                    setMinBrightness(
                      Number(
                        event.target.value,
                      ),
                    )
                }
              />
            </div>


            <div className="wc-field">
              <div className="wc-range-header">
                <label className="wc-label">
                  Light radius / falloff
                </label>

                <span className="wc-value">
                  {
                    brightnessSoftening
                      .toFixed(
                        2,
                      )
                  }
                </span>
              </div>

              <input
                className="wc-range"

                type="range"

                min="0.25"

                max="12"

                step="0.05"

                value={
                  brightnessSoftening
                }

                onChange={
                  (
                    event,
                  ) =>
                    setBrightnessSoftening(
                      Number(
                        event.target.value,
                      ),
                    )
                }
              />
            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Visualise"

            subtitle="Graph helper geometry."
          >
            <div className="wc-toggle-grid">

              <label className="wc-checkbox">
                <input
                  type="checkbox"

                  checked={
                    showCurve
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setShowCurve(
                        event.target.checked,
                      )
                  }
                />

                <span>
                  Show curve
                </span>
              </label>


              <label className="wc-checkbox">
                <input
                  type="checkbox"

                  checked={
                    showPlane
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setShowPlane(
                        event.target.checked,
                      )
                  }
                />

                <span>
                  Show plane
                </span>
              </label>


              <label className="wc-checkbox">
                <input
                  type="checkbox"

                  checked={
                    showGrid
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setShowGrid(
                        event.target.checked,
                      )
                  }
                />

                <span>
                  Show grid
                </span>
              </label>

            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Graph Line"

            subtitle="Equation curve appearance."
          >
            <div className="wc-line-grid">

              <div className="wc-field">
                <label className="wc-label">
                  Colour
                </label>

                <input
                  className="wc-color"

                  type="color"

                  value={
                    lineColor
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setLineColor(
                        event.target.value,
                      )
                  }
                />
              </div>


              <div className="wc-field">
                <div className="wc-range-header">
                  <label className="wc-label">
                    Width
                  </label>

                  <span className="wc-value">
                    {
                      lineWidth
                    }
                  </span>
                </div>

                <input
                  className="wc-range"

                  type="range"

                  min="1"

                  max="8"

                  step="1"

                  value={
                    lineWidth
                  }

                  onChange={
                    (
                      event,
                    ) =>
                      setLineWidth(
                        Number(
                          event.target.value,
                        ),
                      )
                  }
                />
              </div>

            </div>
          </CarouselSettingsCard>


          <CarouselSettingsCard
            title="Fade"

            subtitle="Fade wallpapers farther from the active position."
          >
            <div className="wc-field">
              <div className="wc-range-header">
                <label className="wc-label">
                  Fade amount
                </label>

                <span className="wc-value">
                  {
                    fadeAmount
                  }%
                </span>
              </div>

              <input
                className="wc-range"

                type="range"

                min="0"

                max="100"

                step="1"

                value={
                  fadeAmount
                }

                onChange={
                  (
                    event,
                  ) =>
                    setFadeAmount(
                      Number(
                        event.target.value,
                      ),
                    )
                }
              />
            </div>
          </CarouselSettingsCard>

        </aside>
      </div>
    </section>
  )
}
