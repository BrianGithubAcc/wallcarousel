import {
  useState,
} from 'react'

import type {
  LibraryImage,
} from '../../hooks/useLibrary'

import type {
  Playlist,
} from '../../hooks/usePlaylists'

interface PlaylistManagerProps {
  images: LibraryImage[]
  playlists: Playlist[]
  selectedPlaylistId: string | null
  onSelectPlaylist: (
    id: string | null,
  ) => void
  onCreatePlaylist: (
    name: string,
  ) => void
  onDeletePlaylist: (
    id: string,
  ) => void
}

export function PlaylistManager({
  images,
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
}: PlaylistManagerProps) {
  const [
    creating,
    setCreating,
  ] = useState(false)

  const [
    name,
    setName,
  ] = useState('')

  const submit = () => {
    const trimmed =
      name.trim()

    if (!trimmed) {
      return
    }

    onCreatePlaylist(
      trimmed,
    )

    setName('')
    setCreating(false)
  }

  return (
    <aside className="playlist-sidebar">
      <div className="sidebar-title">
        Playlists
      </div>

      <button
        type="button"
        className={
          `playlist-item ${
            selectedPlaylistId === null
              ? 'active'
              : ''
          }`
        }
        onClick={() =>
          onSelectPlaylist(null)
        }
      >
        <span>
          All Wallpapers
        </span>

        <span className="playlist-count">
          {images.length}
        </span>
      </button>

      {playlists.map(
        (playlist) => (
          <button
            type="button"
            key={playlist.id}
            className={
              `playlist-item ${
                selectedPlaylistId ===
                playlist.id
                  ? 'active'
                  : ''
              }`
            }
            onClick={() =>
              onSelectPlaylist(
                playlist.id,
              )
            }
            onContextMenu={(
              event,
            ) => {
              event.preventDefault()

              if (
                window.confirm(
                  `Delete playlist "${playlist.name}"?`,
                )
              ) {
                onDeletePlaylist(
                  playlist.id,
                )
              }
            }}
          >
            <span>
              {playlist.name}
            </span>

            <span className="playlist-count">
              {playlist.imageIds.length}
            </span>
          </button>
        ),
      )}

      {creating ? (
        <div className="new-playlist-form">
          <input
            autoFocus
            value={name}
            placeholder="Playlist name"
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                'Enter'
              ) {
                submit()
              }

              if (
                event.key ===
                'Escape'
              ) {
                setCreating(
                  false,
                )
              }
            }}
          />

          <button
            type="button"
            onClick={submit}
          >
            Create
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="new-playlist"
          onClick={() =>
            setCreating(true)
          }
        >
          + New Playlist
        </button>
      )}
    </aside>
  )
}
