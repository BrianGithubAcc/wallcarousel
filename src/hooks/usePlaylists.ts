import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

export interface Playlist {
  id: string
  name: string
  imageIds: string[]
}
interface PersistedPlaylistState {
  playlists: Playlist[]
  selectedPlaylistId: string | null
}

const STORAGE_KEY =
  'wallcarousel.playlists.v1'

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'favourites',
    name: 'Favourites',
    imageIds: [],
  },
]

function createPlaylist(
  name: string,
): Playlist {
  return {
    id: crypto.randomUUID(),
    name,
    imageIds: [],
  }
}

function isPlaylist(
  value: unknown,
): value is Playlist {
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false
  }

  const playlist =
    value as Partial<Playlist>

  return (
    typeof playlist.id === 'string' &&
    typeof playlist.name === 'string' &&
    Array.isArray(
      playlist.imageIds,
    ) &&
    playlist.imageIds.every(
      (id) =>
        typeof id === 'string',
    )
  )
}

function loadState():
  PersistedPlaylistState {
  const fallback: PersistedPlaylistState = {
    playlists: DEFAULT_PLAYLISTS,
    selectedPlaylistId: null,
  }

  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      )

    if (!raw) {
      return fallback
    }

    const parsed =
      JSON.parse(raw) as Partial<PersistedPlaylistState>

    if (
      !Array.isArray(
        parsed.playlists,
      )
    ) {
      return fallback
    }

    const playlists =
      parsed.playlists.filter(
        isPlaylist,
      )

    /*
     * If saved data somehow becomes
     * empty/corrupt, restore the default
     * Favourites playlist.
     */
    if (playlists.length === 0) {
      return fallback
    }

    const selectedPlaylistId =
      typeof parsed.selectedPlaylistId ===
      'string'
        ? parsed.selectedPlaylistId
        : null

    /*
     * Do not restore a selected playlist
     * that no longer exists.
     */
    const validSelectedId =
      selectedPlaylistId &&
      playlists.some(
        (playlist) =>
          playlist.id ===
          selectedPlaylistId,
      )
        ? selectedPlaylistId
        : null

    return {
      playlists,
      selectedPlaylistId:
        validSelectedId,
    }
  } catch (error) {
    console.error(
      'Failed to load playlists:',
      error,
    )

    return fallback
  }
}

export function usePlaylists() {
  const [
    initialState,
  ] = useState<PersistedPlaylistState>(
    loadState,
  )

  const [
    playlists,
    setPlaylists,
  ] = useState<Playlist[]>(
    initialState.playlists,
  )

  const [
    selectedPlaylistId,
    setSelectedPlaylistId,
  ] = useState<string | null>(
    initialState.selectedPlaylistId,
  )

  /*
   * Automatically persist every playlist
   * change and the selected playlist.
   */
  useEffect(() => {
    const state: PersistedPlaylistState = {
      playlists,
      selectedPlaylistId,
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state),
      )
    } catch (error) {
      console.error(
        'Failed to save playlists:',
        error,
      )
    }
  }, [
    playlists,
    selectedPlaylistId,
  ])

  const createPlaylistAction =
    useCallback(
      (name: string) => {
        const trimmed =
          name.trim()

        if (!trimmed) {
          return
        }

        const playlist =
          createPlaylist(
            trimmed,
          )

        setPlaylists(
          (current) => [
            ...current,
            playlist,
          ],
        )

        setSelectedPlaylistId(
          playlist.id,
        )
      },
      [],
    )

  const deletePlaylist =
    useCallback(
      (id: string) => {
        setPlaylists(
          (current) =>
            current.filter(
              (playlist) =>
                playlist.id !== id,
            ),
        )

        setSelectedPlaylistId(
          (current) =>
            current === id
              ? null
              : current,
        )
      },
      [],
    )

  const addImageToPlaylist =
    useCallback(
      (
        playlistId: string,
        imageId: string,
      ) => {
        setPlaylists(
          (current) =>
            current.map(
              (playlist) => {
                if (
                  playlist.id !==
                  playlistId
                ) {
                  return playlist
                }

                if (
                  playlist.imageIds.includes(
                    imageId,
                  )
                ) {
                  return playlist
                }

                return {
                  ...playlist,
                  imageIds: [
                    ...playlist.imageIds,
                    imageId,
                  ],
                }
              },
            ),
        )
      },
      [],
    )

  const removeImageFromPlaylist =
    useCallback(
      (
        playlistId: string,
        imageId: string,
      ) => {
        setPlaylists(
          (current) =>
            current.map(
              (playlist) => {
                if (
                  playlist.id !==
                  playlistId
                ) {
                  return playlist
                }

                return {
                  ...playlist,
                  imageIds:
                    playlist.imageIds.filter(
                      (id) =>
                        id !== imageId,
                    ),
                }
              },
            ),
        )
      },
      [],
    )

  const selectedPlaylist =
    useMemo(
      () =>
        playlists.find(
          (playlist) =>
            playlist.id ===
            selectedPlaylistId,
        ) ?? null,
      [
        playlists,
        selectedPlaylistId,
      ],
    )

  return {
    playlists,
    selectedPlaylist,
    selectedPlaylistId,
    setSelectedPlaylistId,
    createPlaylist:
      createPlaylistAction,
    deletePlaylist,
    addImageToPlaylist,
    removeImageFromPlaylist,
  }
}
