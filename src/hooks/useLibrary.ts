import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export interface LibraryImage {
  id: string
  path: string
  name: string
}
interface PersistedLibraryState {
  images: LibraryImage[]
}

const STORAGE_KEY =
  'wallcarousel.library.v1'

function createImage(
  path: string,
): LibraryImage {
  const name =
    path
      .split('/')
      .pop() ?? path

  return {
    id: path,
    path,
    name,
  }
}

function isLibraryImage(
  value: unknown,
): value is LibraryImage {
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false
  }

  const image =
    value as Partial<LibraryImage>

  return (
    typeof image.id === 'string' &&
    typeof image.path === 'string' &&
    typeof image.name === 'string'
  )
}

function loadImages(): LibraryImage[] {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      )

    if (!raw) {
      return []
    }

    const parsed =
      JSON.parse(
        raw,
      ) as Partial<PersistedLibraryState>

    if (
      !Array.isArray(
        parsed.images,
      )
    ) {
      return []
    }

    /*
     * Ignore malformed saved entries
     * rather than preventing the app
     * from starting.
     */
    return parsed.images.filter(
      isLibraryImage,
    )
  } catch (error) {
    console.error(
      'Failed to load wallpaper library:',
      error,
    )

    return []
  }
}

export function useLibrary() {
  const [
    images,
    setImages,
  ] = useState<LibraryImage[]>(
    loadImages,
  )

  /*
   * Save the complete wallpaper library
   * whenever it changes.
   *
   * We only store metadata:
   *
   *   id
   *   path
   *   name
   *
   * The actual image files remain in
   * their original folders.
   */
  useEffect(() => {
    const state: PersistedLibraryState = {
      images,
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state),
      )
    } catch (error) {
      console.error(
        'Failed to save wallpaper library:',
        error,
      )
    }
  }, [images])

  const addImages =
    useCallback(
      (paths: string[]) => {
        setImages(
          (current) => {
            const existing =
              new Set(
                current.map(
                  (image) =>
                    image.path,
                ),
              )

            const newImages =
              paths
                .filter(
                  (path) =>
                    !existing.has(
                      path,
                    ),
                )
                .map(
                  createImage,
                )

            return [
              ...current,
              ...newImages,
            ]
          },
        )
      },
      [],
    )

  const removeImage =
    useCallback(
      (id: string) => {
        setImages(
          (current) =>
            current.filter(
              (image) =>
                image.id !== id,
            ),
        )
      },
      [],
    )

  const clearLibrary =
    useCallback(() => {
      setImages([])
    }, [])

  return {
    images,
    addImages,
    removeImage,
    clearLibrary,
  }
}
