import type {
  Playlist,
} from '../../hooks/usePlaylists'

interface ImageContextMenuProps {
  x: number
  y: number
  playlists: Playlist[]
  imageId: string
  onAdd: (
    playlistId: string,
  ) => void
  onRemove: (
    playlistId: string,
  ) => void
  onClose: () => void
}

export function ImageContextMenu({
  x,
  y,
  playlists,
  imageId,
  onAdd,
  onRemove,
  onClose,
}: ImageContextMenuProps) {
  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={onClose}
      />

      <div
        className="image-context-menu"
        style={{
          left: x,
          top: y,
        }}
      >
        <div className="context-menu-title">
          Add to Playlist
        </div>

        {playlists.length === 0 ? (
          <div className="context-menu-empty">
            No playlists yet
          </div>
        ) : (
          playlists.map(
            (playlist) => {
              const contains =
                playlist.imageIds.includes(
                  imageId,
                )

              return (
                <button
                  type="button"
                  key={playlist.id}
                  onClick={() => {
                    if (contains) {
                      onRemove(
                        playlist.id,
                      )
                    } else {
                      onAdd(
                        playlist.id,
                      )
                    }

                    onClose()
                  }}
                >
                  <span>
                    {playlist.name}
                  </span>

                  <span>
                    {contains
                      ? '✓'
                      : '+'}
                  </span>
                </button>
              )
            },
          )
        )}
      </div>
    </>
  )
}
