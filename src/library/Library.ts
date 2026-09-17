export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp',
  'svg',
] as const

export function isImageFile(
  path: string,
): boolean {
  const extension =
    path
      .split('.')
      .pop()
      ?.toLowerCase()

  if (!extension) {
    return false
  }

  return IMAGE_EXTENSIONS.includes(
    extension as typeof IMAGE_EXTENSIONS[number],
  )
}

export function getExtension(
  path: string,
): string {
  return (
    path
      .split('.')
      .pop()
      ?.toLowerCase() ?? ''
  )
}

export function getFileName(
  path: string,
): string {
  return (
    path
      .split('/')
      .pop() ?? path
  )
}
