import {
  ImagePicker,
} from '../Library/ImagePicker'

import {
  PlaylistManager,
} from '../Library/PlaylistManager'

import {
  VirtualImageGrid,
} from '../Library/VirtualImageGrid'

import type {
  LibraryImage,
} from '../../hooks/useLibrary'

import type {
  Playlist,
} from '../../hooks/usePlaylists'

interface ImagesPageProps {
  images: LibraryImage[]

  playlists: Playlist[]

  selectedPlaylistId:
    string | null

  onSelectPlaylist: (
    id: string | null,
  ) => void

  onCreatePlaylist: (
    name: string,
  ) => void

  onDeletePlaylist: (
    id: string,
  ) => void

  onAddImageToPlaylist: (
    playlistId: string,
    imageId: string,
  ) => void

  onRemoveImageFromPlaylist: (
    playlistId: string,
    imageId: string,
  ) => void

  onImagesSelected: (
    paths: string[],
  ) => void
}

export function ImagesPage({
  images,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddImageToPlaylist,
  onRemoveImageFromPlaylist,
  onImagesSelected,
}: ImagesPageProps) {
  const selectedPlaylist =
    playlists.find(
      (playlist) =>
        playlist.id ===
        selectedPlaylistId,
    )

  /*
   * "All Wallpapers" shows the entire
   * library.
   *
   * Selecting a playlist filters the
   * library down to its image IDs.
   */
  const displayedImages =
    selectedPlaylist
      ? selectedPlaylist.imageIds
          .map((id) =>
            images.find(
              (image) =>
                image.id === id,
            ),
          )
          .filter(
            (
              image,
            ): image is LibraryImage =>
              image !== undefined,
          )
      : images

  return (
    <section className="page images-page">
      <header className="page-header">
        <div>
          <h1>Wallpapers</h1>

          <p className="page-subtitle">
            Your images, arranged into playlists.
          </p>
        </div>

        <ImagePicker
          onImagesSelected={
            onImagesSelected
          }
        />
      </header>

      <div className="images-layout">
        <PlaylistManager
          images={images}
          playlists={playlists}
          selectedPlaylistId={
            selectedPlaylistId
          }
          onSelectPlaylist={
            onSelectPlaylist
          }
          onCreatePlaylist={
            onCreatePlaylist
          }
          onDeletePlaylist={
            onDeletePlaylist
          }
        />

        <div className="library-panel">
          <div className="library-header">
            <div>
              <h2>
                {selectedPlaylist
                  ? selectedPlaylist.name
                  : 'Library'}
              </h2>

              <span>
                {displayedImages.length}{' '}
                {displayedImages.length === 1
                  ? 'image'
                  : 'images'}
              </span>
            </div>
          </div>

          {displayedImages.length === 0 ? (
            <div className="library-empty">
              <div className="empty-icon">
                +
              </div>

              <h3>
                {selectedPlaylist
                  ? 'This playlist is empty'
                  : 'No wallpapers yet'}
              </h3>

              <p>
                {selectedPlaylist
                  ? 'Right-click an image to add it to this playlist.'
                  : 'Add individual images or select a folder to get started.'}
              </p>
            </div>
          ) : (
            <VirtualImageGrid
              images={
                displayedImages
              }
              playlists={playlists}
              onAddImageToPlaylist={
                onAddImageToPlaylist
              }
              onRemoveImageFromPlaylist={
                onRemoveImageFromPlaylist
              }
            />
          )}
        </div>
      </div>
    </section>
  )
}
