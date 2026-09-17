import { Vector3 } from 'three'
import type { Mesh, PerspectiveCamera, Quaternion } from 'three'

export const CARD_WIDTH = 3.2
export const CARD_HEIGHT = 1.8
export const LAYOUT_PHASE_SAMPLES = 256
export interface CardPose { position: Vector3, quaternion: Quaternion }
export interface CardBounds { left: number, right: number, top: number, bottom: number }
interface CameraCard { center: Vector3, right: Vector3, up: Vector3 }

function prepareCard(card: CardPose, camera: PerspectiveCamera): CameraCard {
  return {
    center: card.position.clone().applyMatrix4(camera.matrixWorldInverse),
    right: new Vector3(1, 0, 0).applyQuaternion(card.quaternion).transformDirection(camera.matrixWorldInverse).multiplyScalar(CARD_WIDTH / 2),
    up: new Vector3(0, 1, 0).applyQuaternion(card.quaternion).transformDirection(camera.matrixWorldInverse).multiplyScalar(CARD_HEIGHT / 2),
  }
}

function projectedBounds(card: CameraCard, camera: PerspectiveCamera, scale: number): CardBounds | null {
  const { center, right, up } = card
  let polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: center.x + (x * right.x + y * up.x) * scale,
    y: center.y + (x * right.y + y * up.y) * scale,
    z: center.z + (x * right.z + y * up.z) * scale,
  }))
  // Clip to the near/far planes before dividing by depth. Partially visible
  // cards remain visible, including while entering the viewport.
  for (const [plane, direction] of [[-camera.near, -1], [-camera.far, 1]]) {
    const clipped: typeof polygon = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]
      const b = polygon[(i + 1) % polygon.length]
      const insideA = (a.z - plane) * direction >= 0
      const insideB = (b.z - plane) * direction >= 0
      if (insideA) clipped.push(a)
      if (insideA !== insideB) {
        const t = (plane - a.z) / (b.z - a.z)
        clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: plane })
      }
    }
    polygon = clipped
    if (!polygon.length) return null
  }
  const bounds = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity }
  const matrix = camera.projectionMatrix.elements
  for (const point of polygon) {
    const x = point.x * matrix[0] / -point.z
    const y = point.y * matrix[5] / -point.z
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    bounds.left = Math.min(bounds.left, x)
    bounds.right = Math.max(bounds.right, x)
    bounds.bottom = Math.min(bounds.bottom, y)
    bounds.top = Math.max(bounds.top, y)
  }
  if (bounds.right <= -1 || bounds.left >= 1 || bounds.top <= -1 || bounds.bottom >= 1) return null
  return { left: Math.max(-1, bounds.left), right: Math.min(1, bounds.right), bottom: Math.max(-1, bounds.bottom), top: Math.min(1, bounds.top) }
}

export function projectCardBounds(card: CardPose, camera: PerspectiveCamera, scale: number): CardBounds | null {
  return projectedBounds(prepareCard(card, camera), camera, scale)
}

export function boundsOverlap(a: CardBounds, b: CardBounds) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom
}

function frameFits(frame: CameraCard[], camera: PerspectiveCamera, scale: number) {
  // A relative gap avoids making a tight equation impossible merely because
  // its projected centres are less than a fixed number of pixels apart.
  const bounds = frame.map(card => projectedBounds(card, camera, scale * 1.06))
    .filter((value): value is CardBounds => value !== null)
    .sort((a, b) => a.left - b.left)
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length && bounds[j].left < bounds[i].right; j++) {
      if (boundsOverlap(bounds[i], bounds[j])) return false
    }
  }
  return true
}

// Solve once for the equation's complete scroll cycle, not for the currently
// focused image or current animation frame. Every image receives this same
// scale until the equation, image count, or viewport changes.
export function calculateUniformCardScale(frames: CardPose[][], camera: PerspectiveCamera, maximumScale: number): number {
  if (!frames.length || !Number.isFinite(maximumScale) || maximumScale <= 0) return 0
  camera.updateMatrixWorld()
  const prepared = frames.map(frame => frame.map(card => prepareCard(card, camera)))
  const fits = (scale: number) => prepared.every(frame => frameFits(frame, camera, scale))
  if (fits(maximumScale)) return maximumScale
  let low = 0
  let high = maximumScale
  for (let iteration = 0; iteration < 22; iteration++) {
    const scale = (low + high) / 2
    if (fits(scale)) low = scale
    else high = scale
  }
  // Margin between sampled phases, without adjusting the result while scrolling.
  return low * .97
}

export function applyUniformCardScale(meshes: Mesh[], camera: PerspectiveCamera, scale: number) {
  camera.updateMatrixWorld()
  for (const mesh of meshes) {
    mesh.scale.set(scale, scale, 1)
    mesh.frustumCulled = true
    // Offscreen is the only layout-based reason to skip drawing a valid card.
    mesh.visible = scale > 0 && projectCardBounds(mesh, camera, scale) !== null
  }
}
