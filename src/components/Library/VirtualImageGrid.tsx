import {
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  LibraryImage,
} from '../../hooks/useLibrary'

import type {
  Playlist,
} from '../../hooks/usePlaylists'

import {
  LibraryThumbnail,
} from './LibraryThumbnail'

import {
  ImageContextMenu,
} from './ImageContextMenu'

interface VirtualImageGridProps {
  images: LibraryImage[]

  playlists: Playlist[]

  onAddImageToPlaylist: (
    playlistId: string,
    imageId: string,
  ) => void

  onRemoveImageFromPlaylist: (
    playlistId: string,
    imageId: string,
  ) => void
}

interface ContextMenuState {
  x: number
  y: number
  imageId: string
}

const MIN_CARD_WIDTH = 240
const CARD_HEIGHT = 180
const ROW_GAP = 16
const COLUMN_GAP = 16
const OVERSCAN_ROWS = 3

export function VirtualImageGrid({
  images,
  playlists,
  onAddImageToPlaylist,
  onRemoveImageFromPlaylist,
}: VirtualImageGridProps) {
  const containerRef =
    useRef<HTMLDivElement>(null)

  const [
    containerWidth,
    setContainerWidth,
  ] = useState(0)

  const [
    scrollTop,
    setScrollTop,
  ] = useState(0)

  const [
    viewportHeight,
    setViewportHeight,
  ] = useState(0)

  const [
    contextMenu,
    setContextMenu,
  ] =
    useState<ContextMenuState | null>(
      null,
    )

  /*
   * WebKit/Tauri can briefly report bogus dimensions while the
   * compositor is resizing/redrawing the window. Never allow that
   * transient value to create thousands of CSS grid columns.
   */
  const safeContainerWidth =
    Number.isFinite(containerWidth) &&
    containerWidth > 0
      ? containerWidth
      : 0

  const columnCount =
    Math.min(
      32,
      Math.max(
        1,
        Math.floor(
          (
            safeContainerWidth +
            COLUMN_GAP
          ) /
          (
            MIN_CARD_WIDTH +
            COLUMN_GAP
          ),
        ),
      ),
    )

  const rowCount =
    Math.ceil(
      images.length /
        columnCount,
    )

  const rowHeight =
    CARD_HEIGHT +
    ROW_GAP

  const firstVisibleRow =
    Math.max(
      0,
      Math.floor(
        scrollTop /
          rowHeight,
      ) -
        OVERSCAN_ROWS,
    )

  const lastVisibleRow =
    Math.min(
      rowCount,
      Math.ceil(
        (
          scrollTop +
          viewportHeight
        ) /
          rowHeight,
      ) +
        OVERSCAN_ROWS,
    )

  useEffect(() => {
    const element =
      containerRef.current

    if (!element) {
      return
    }

    const updateSize = () => {
      const width =
        element.clientWidth

      const height =
        element.clientHeight

      /*
       * Ignore invalid/transient WebKit layout measurements.
       * In particular, don't replace a valid size with a bogus one
       * during the Tauri compositor redraw.
       */
      if (
        Number.isFinite(width) &&
        width > 0
      ) {
        setContainerWidth(
          width,
        )
      }

      if (
        Number.isFinite(height) &&
        height > 0
      ) {
        setViewportHeight(
          height,
        )
      }
    }

    updateSize()

    const observer =
      new ResizeObserver(
        updateSize,
      )

    observer.observe(
      element,
    )

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const element =
      containerRef.current

    if (!element) {
      return
    }

    let frame = 0

    const handleScroll = () => {
      if (frame) {
        return
      }

      frame =
        requestAnimationFrame(
          () => {
            setScrollTop(
              element.scrollTop,
            )

            frame = 0
          },
        )
    }

    element.addEventListener(
      'scroll',
      handleScroll,
      {
        passive: true,
      },
    )

    return () => {
      element.removeEventListener(
        'scroll',
        handleScroll,
      )

      if (frame) {
        cancelAnimationFrame(
          frame,
        )
      }
    }
  }, [])

  useEffect(() => {
    const closeMenu = () =>
      setContextMenu(null)

    window.addEventListener(
      'resize',
      closeMenu,
    )

    return () => {
      window.removeEventListener(
        'resize',
        closeMenu,
      )
    }
  }, [])

  const visibleRows = []

  for (
    let row = firstVisibleRow;
    row < lastVisibleRow;
    row++
  ) {
    const start =
      row *
      columnCount

    visibleRows.push({
      row,
      images: images.slice(
        start,
        start + columnCount,
      ),
    })
  }

  return (
    <>
      <div
        ref={containerRef}
        className="virtual-image-grid"
      >
        <div
          className="virtual-image-grid-content"
          style={{
            height:
              Math.max(
                0,
                rowCount *
                  rowHeight -
                  ROW_GAP,
              ),
          }}
        >
          {visibleRows.map(
            ({
              row,
              images: rowImages,
            }) => (
              <div
                key={row}
                className="virtual-image-row"
                style={{
                  transform:
                    `translateY(${row * rowHeight}px)`,
                  gridTemplateColumns:
                    `repeat(${columnCount}, minmax(0, 1fr))`,
                }}
              >
                {rowImages.map(
                  (image) => (
                    <div
                      className="library-card"
                      key={image.id}
                      onContextMenu={(
                        event,
                      ) => {
                        event.preventDefault()

                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          imageId:
                            image.id,
                        })
                      }}
                    >
                      <LibraryThumbnail
                        image={image}
                      />

                      <div className="library-card-info">
                        <span
                          className="library-card-name"
                          title={
                            image.name
                          }
                        >
                          {image.name}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {contextMenu && (
        <ImageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          imageId={
            contextMenu.imageId
          }
          playlists={playlists}
          onAdd={
            onAddImageToPlaylist
              ? (
                  playlistId,
                ) => {
                  onAddImageToPlaylist(
                    playlistId,
                    contextMenu.imageId,
                  )
                }
              : () => {}
          }
          onRemove={
            onRemoveImageFromPlaylist
              ? (
                  playlistId,
                ) => {
                  onRemoveImageFromPlaylist(
                    playlistId,
                    contextMenu.imageId,
                  )
                }
              : () => {}
          }
          onClose={() =>
            setContextMenu(null)
          }
        />
      )}
    </>
  )
}
