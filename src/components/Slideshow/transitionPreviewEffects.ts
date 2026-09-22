// Approximate the Linux AWWW masks and default cubic-bezier(.54, 0, .34, .99).
// The extra effects are rendered by the macOS/browser preview. macOS's native
// desktop-picture API changes wallpapers immediately and cannot animate them.
export const previewEffects = [
  'fade', 'left', 'right', 'top', 'bottom', 'wipe', 'wave', 'grow', 'center', 'any', 'outer',
  'zoom', 'push-left', 'push-right', 'push-up', 'push-down', 'blur', 'pixelate',
  'stripes', 'checker', 'corners', 'diagonal', 'spiral',
]

export const macOSPreviewEffects = [...previewEffects, 'random', 'none']

export function transitionLabel(effect: string): string {
  const labels: Record<string, string> = {
    none: 'Instant',
    'push-left': 'Push left',
    'push-right': 'Push right',
    'push-up': 'Push up',
    'push-down': 'Push down',
    pixelate: 'Pixelate',
  }
  return labels[effect] ?? effect.replace(/-/g, ' ').replace(/^./, character => character.toUpperCase())
}

export function easedProgress(progress: number): number {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  const cubic = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let low = 0
  let high = 1
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2
    if (cubic(t, .54, .34) < progress) low = t
    else high = t
  }
  return cubic((low + high) / 2, 0, .99)
}

export function drawSample(context: CanvasRenderingContext2D, alternate: boolean, width: number, height: number) {
  const sky = context.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, alternate ? '#693653' : '#163957')
  sky.addColorStop(1, alternate ? '#efbc8c' : '#9ccdc0')
  context.fillStyle = sky
  context.fillRect(0, 0, width, height)
  context.fillStyle = alternate ? '#ffdcaa' : '#e3f0d1'
  context.beginPath()
  context.arc(width * (alternate ? .7 : .27), height * .3, height * .09, 0, Math.PI * 2)
  context.fill()
  for (let layer = 0; layer < 3; layer++) {
    context.beginPath()
    context.moveTo(0, height)
    for (let x = 0; x <= width; x += 4) {
      const y = height * (.59 + layer * .12) + Math.sin(x / width * 8 + layer * 2 + (alternate ? 2 : 0)) * height * .095
      context.lineTo(x, y)
    }
    context.lineTo(width, height)
    context.closePath()
    context.fillStyle = (alternate ? ['#a36b78', '#6c4a68', '#302e47'] : ['#467c8a', '#305e69', '#173e4b'])[layer]
    context.fill()
  }
}

export function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement | null, alternate: boolean, width: number, height: number) {
  if (!image) { drawSample(context, alternate, width, height); return }
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const w = image.naturalWidth * scale
  const h = image.naturalHeight * scale
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
}

export function drawTransition(
  context: CanvasRenderingContext2D,
  before: CanvasImageSource,
  after: CanvasImageSource,
  effect: string,
  progress: number,
  origin: { x: number, y: number },
  width: number,
  height: number,
) {
  const p = easedProgress(progress)
  context.clearRect(0, 0, width, height)
  context.drawImage(before, 0, 0, width, height)
  if (progress <= 0 && effect !== 'none') return
  if (progress >= 1 || effect === 'none') { context.drawImage(after, 0, 0, width, height); return }
  context.save()
  switch (effect) {
    case 'fade':
      context.globalAlpha = p
      context.drawImage(after, 0, 0, width, height)
      break
    case 'zoom': {
      const scale = 1.16 - p * .16
      const w = width * scale
      const h = height * scale
      context.globalAlpha = .25 + p * .75
      context.drawImage(after, (width - w) / 2, (height - h) / 2, w, h)
      break
    }
    case 'push-left':
    case 'push-right':
    case 'push-up':
    case 'push-down': {
      const horizontal = effect === 'push-left' || effect === 'push-right'
      const direction = effect === 'push-left' || effect === 'push-up' ? -1 : 1
      const offset = (horizontal ? width : height) * p * direction
      const beforeX = horizontal ? offset : 0
      const beforeY = horizontal ? 0 : offset
      const afterX = horizontal ? offset - direction * width : 0
      const afterY = horizontal ? 0 : offset - direction * height
      context.drawImage(before, beforeX, beforeY, width, height)
      context.drawImage(after, afterX, afterY, width, height)
      break
    }
    case 'blur':
      context.globalAlpha = .35 + p * .65
      context.filter = `blur(${Math.round((1 - p) * 18)}px)`
      context.drawImage(after, 0, 0, width, height)
      break
    case 'pixelate': {
      const pixelSize = Math.max(1, Math.round((1 - p) * 28))
      const pixelated = document.createElement('canvas')
      pixelated.width = Math.max(1, Math.ceil(width / pixelSize))
      pixelated.height = Math.max(1, Math.ceil(height / pixelSize))
      const pixelContext = pixelated.getContext('2d')
      if (pixelContext) {
        pixelContext.drawImage(after, 0, 0, pixelated.width, pixelated.height)
        context.imageSmoothingEnabled = false
        context.drawImage(pixelated, 0, 0, width, height)
      } else {
        context.drawImage(after, 0, 0, width, height)
      }
      break
    }
    case 'stripes': {
      const stripeCount = 18
      const stripeWidth = width / stripeCount
      context.beginPath()
      for (let index = 0; index < stripeCount; index++) {
        const local = Math.max(0, Math.min(1, (p - (index % 2) * .16) / .84))
        context.rect(index * stripeWidth, 0, stripeWidth * local, height)
      }
      context.clip()
      context.drawImage(after, 0, 0, width, height)
      break
    }
    case 'checker': {
      const columns = 12
      const rows = 7
      const cellWidth = width / columns
      const cellHeight = height / rows
      context.beginPath()
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const stagger = ((row + column) % 2) * .2
          if (p > stagger) context.rect(column * cellWidth, row * cellHeight, cellWidth, cellHeight)
        }
      }
      context.clip()
      context.drawImage(after, 0, 0, width, height)
      break
    }
    case 'corners': {
      const radius = Math.hypot(width, height) * p
      context.beginPath()
      for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
        context.moveTo(x + radius, y)
        context.arc(x, y, radius, 0, Math.PI * 2)
      }
      context.clip()
      context.drawImage(after, 0, 0, width, height)
      break
    }
    case 'diagonal': {
      const distance = (width + height) * p
      const points = [[0, 0], [Math.min(width, distance), 0]]
      if (distance > width) points.push([width, Math.min(height, distance - width)])
      if (distance > height) points.push([Math.min(width, distance - height), height])
      points.push([0, Math.min(height, distance)])
      context.beginPath()
      context.moveTo(points[0][0], points[0][1])
      for (const [x, y] of points.slice(1)) context.lineTo(x, y)
      context.closePath()
      context.clip()
      context.drawImage(after, 0, 0, width, height)
      break
    }
    case 'spiral': {
      const x = width * origin.x
      const y = height * origin.y
      const radius = Math.hypot(width, height)
      context.beginPath()
      context.moveTo(x, y)
      context.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p)
      context.closePath()
      context.clip()
      context.drawImage(after, 0, 0, width, height)
      break
    }
    default:
      context.beginPath()
      switch (effect) {
        case 'left': context.rect(0, 0, width * p, height); break
        case 'right': context.rect(width * (1 - p), 0, width * p, height); break
        case 'top': context.rect(0, 0, width, height * p); break
        case 'bottom': context.rect(0, height * (1 - p), width, height * p); break
        case 'grow':
        case 'center':
        case 'any':
        case 'outer': {
          const x = width * origin.x
          const y = height * origin.y
          const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
          if (effect === 'outer') context.rect(0, 0, width, height)
          const size = radius * (effect === 'outer' ? 1 - p : p)
          context.moveTo(x + size, y)
          context.arc(x, y, size, 0, Math.PI * 2)
          break
        }
        default: {
          // A 45-degree sweep, with a sinusoidal edge for the wave variant.
          const amplitude = effect === 'wave' ? height * .035 : 0
          const edge = (width + height + amplitude * 2) * (1 - p) - height - amplitude
          context.moveTo(width, 0)
          context.lineTo(width, height)
          for (let y = height; y >= 0; y -= 2) {
            context.lineTo(edge + y + Math.sin(y / height * Math.PI * 10) * amplitude, y)
          }
          context.closePath()
        }
      }
      context.clip(effect === 'outer' ? 'evenodd' : 'nonzero')
      context.drawImage(after, 0, 0, width, height)
      break
  }
  context.restore()
}
