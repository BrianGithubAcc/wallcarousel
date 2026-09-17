import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

interface ImagePickerProps {
  onImagesSelected: (paths: string[]) => void
}

export function ImagePicker({
  onImagesSelected,
}: ImagePickerProps) {
  const chooseImages = async () => {
    const selected = await open({
      multiple: true,
      directory: false,

      filters: [
        {
          name: 'Images',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif',
            'avif',
            'bmp',
            'svg',
          ],
        },
      ],
    })

    if (!selected) {
      return
    }

    const paths = Array.isArray(selected)
      ? selected
      : [selected]

    onImagesSelected(paths)
  }

  const chooseFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (!selected) {
      return
    }

    const folder = Array.isArray(selected)
      ? selected[0]
      : selected

    if (!folder) {
      return
    }

    try {
      const paths = await invoke<string[]>(
        'scan_wallpaper_directory',
        {
          path: folder,
        },
      )

      onImagesSelected(paths)
    } catch (error) {
      console.error(
        'Failed to scan wallpaper directory:',
        error,
      )
    }
  }

  return (
    <div className="image-picker">
      <button
        type="button"
        onClick={chooseImages}
      >
        Add Images
      </button>

      <button
        type="button"
        onClick={chooseFolder}
      >
        Add Folder
      </button>
    </div>
  )
}
