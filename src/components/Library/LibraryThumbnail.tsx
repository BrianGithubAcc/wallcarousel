import {
  useEffect,
  useState,
} from 'react'

import {
  convertFileSrc,
  invoke,
} from '@tauri-apps/api/core'

import type {
  LibraryImage,
} from '../../hooks/useLibrary'

interface LibraryThumbnailProps {
  image: LibraryImage
}

export function LibraryThumbnail({
  image,
}: LibraryThumbnailProps) {
  const [
    thumbnailPath,
    setThumbnailPath,
  ] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    invoke<string>(
      'generate_thumbnail',
      {
        path: image.path,
      },
    )
      .then((path) => {
        if (!cancelled) {
          setThumbnailPath(path)
        }
      })
      .catch((error) => {
        console.error(
          'Thumbnail generation failed:',
          error,
        )
      })

    return () => {
      cancelled = true
    }
  }, [image.path])

  return (
    <div className="library-thumbnail">
      {thumbnailPath ? (
        <img
          src={convertFileSrc(
            thumbnailPath,
          )}
          alt={image.name}
          draggable={false}
        />
      ) : (
        <div className="thumbnail-loading">
          Loading...
        </div>
      )}
    </div>
  )
}
