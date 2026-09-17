// Approximate AWWW's masks and default cubic-bezier(.54, 0, .34, .99).
export const previewEffects = ['fade', 'left', 'right', 'top', 'bottom', 'wipe', 'wave', 'grow', 'center', 'any', 'outer']

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
  if (effect === 'fade') {
    context.globalAlpha = p
  } else {
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
  }
  context.drawImage(after, 0, 0, width, height)
  context.restore()
}
