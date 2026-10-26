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

interface ThumbnailTask {
  cancelled: boolean
  start: () => void
}

const MAX_CONCURRENT_THUMBNAILS = 3

let activeThumbnailTasks = 0
const thumbnailQueue: ThumbnailTask[] = []

function pumpThumbnailQueue() {
  while (
    activeThumbnailTasks < MAX_CONCURRENT_THUMBNAILS &&
    thumbnailQueue.length > 0
  ) {
    const task = thumbnailQueue.shift()

    if (!task || task.cancelled) {
      continue
    }

    task.start()
  }
}

function requestThumbnail(path: string) {
  const task: ThumbnailTask = {
    cancelled: false,
    start: () => {},
  }

  const promise = new Promise<string>((resolve, reject) => {
    task.start = () => {
      activeThumbnailTasks += 1

      invoke<string>('generate_thumbnail', { path })
        .then(resolve, reject)
        .finally(() => {
          activeThumbnailTasks -= 1
          pumpThumbnailQueue()
        })
    }
  })

  thumbnailQueue.push(task)
  pumpThumbnailQueue()

  return {
    promise,
    cancel: () => {
      task.cancelled = true

      const queuedIndex = thumbnailQueue.indexOf(task)
      if (queuedIndex >= 0) {
        thumbnailQueue.splice(queuedIndex, 1)
      }
    },
  }
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

    const thumbnailRequest = requestThumbnail(image.path)

    thumbnailRequest.promise
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
      thumbnailRequest.cancel()
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
