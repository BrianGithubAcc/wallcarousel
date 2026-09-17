import type { CardPose } from './cardLayout'
import { boundsOverlap, projectCardBounds } from './cardLayout'
import {
  useEffect,
  useMemo,
  useRef,
} from 'react'

import type {
  RefObject,
} from 'react'

import type {
  CarouselCardOrientation,
} from './carousel.types'

import {
  convertFileSrc,
} from '@tauri-apps/api/core'

import * as THREE from 'three'

import {
  CAROUSEL_CAMERA_DISTANCE,
  CAROUSEL_CAMERA_FAR,
  CAROUSEL_CAMERA_FOV,
  CAROUSEL_CAMERA_NEAR,
} from './carouselView'

import {
  saveCarouselConfiguration,
} from './carouselConfiguration'


import {
  buildArcLengthTable,
  buildOpenArcLengthTable,
  compileParametricEquation,
  evaluateCompiledEquation,
  tAtArcLength,
  tAtSignedArcDistance,
  toThreeCoordinates,
  WALLPAPER_SPACING,
} from './parametricEquation'

import type {
  ArcLengthTable,
  CompiledParametricEquation,
  ParametricEquation,
  Point3,
} from './parametricEquation'

export interface CarouselItem {
  id: string
  label: string
  path: string
}

interface CarouselProps {
  items: CarouselItem[]

  positionRef:
    RefObject<number>

  equation:
    ParametricEquation

  onScroll: (
    amount: number,
  ) => void

  fadeAmount?: number

  centerPoint?: Point3

  minBrightness?: number

  brightnessSoftening?: number

  infiniteScroll?: boolean

  closedLoop?: boolean

  cardOrientation?: CarouselCardOrientation

  /*
   * Reports the exact aspect ratio of the
   * actual Three.js carousel viewport.
   *
   * EquationGraph uses this so its screen
   * plane represents the real carousel view.
   */
  onViewAspectChange?: (
    aspect: number,
  ) => void

  /*
   * Used by fullscreen overlay mode.
   */
  transparentBackground?: boolean

  /*
   * Called when a rendered wallpaper card
   * is clicked.
   */
  onItemClick?: (
    item: CarouselItem,
  ) => void

  /*
   * Normal editor carousel stores its
   * effective configuration.
   *
   * Overlay mode disables this so opening
   * the overlay cannot overwrite the saved
   * editor selection.
   */
  persistConfiguration?: boolean
}

interface RenderSlot {
  mesh: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >

  material:
    THREE.MeshBasicMaterial

  virtualIndex:
    number | null

  imageIndex:
    number | null

  /*
   * A newly decoded texture fades in over a
   * few frames.
   *
   * Normally this finishes while the card is
   * still outside the viewport because of
   * the preload ring.
   */
  textureOpacity:
    number

}

interface CachedTexture {
  texture:
    THREE.Texture

  lastUsed:
    number
}


interface ScreenCoilLayout {
  rows:
    number

  columns:
    number

  slotCount:
    number

  /*
   * Grid points in their actual traversal
   * order.
   */
  points:
    Point3[]

  /*
   * Uniform scale for 16:9 wallpaper cards.
   */
  cardScale:
    number
}


interface ClosedLoopLayout {
  /*
   * Centre around which the original curve
   * is expanded.
   */
  center:
    Point3

  /*
   * 1 = equation's original size.
   *
   * >1 = automatically enlarged because
   * there are too many cards to fit without
   * overlap.
   */
  scale:
    number

  /*
   * Camera Z position required to remain
   * outside the expanded closed loop.
   */
  cameraZ:
    number
}

const CARD_WIDTH =
  3.2

const CARD_HEIGHT =
  1.8


/*
 * Minimum edge-to-edge breathing room
 * between cards on closed loops.
 */
const CLOSED_LOOP_CARD_GAP =
  0.45

const BASE_CAMERA_Z =
  CAROUSEL_CAMERA_DISTANCE

/*
 * Keep a large ring of real wallpaper slots
 * either side of the current position.
 *
 * Most of these cards are deliberately
 * outside the viewport. Their textures can
 * finish loading BEFORE scrolling brings
 * them onscreen.
 *
 * 10 left + centre + 10 right = 21 slots.
 */
const RENDER_RADIUS =
  10

const LINEAR_POOL_SIZE =
  RENDER_RADIUS *
    2 +
  1

const MAX_OPEN_SPACING =
  10

/*
 * Enough arc length for every pooled slot,
 * plus a little safety margin for scrolling.
 */
const OPEN_ARC_DISTANCE =
  (
    RENDER_RADIUS +
    2
  ) *
  MAX_OPEN_SPACING

/*
 * Keep enough source detail for a card that
 * is viewed on a high-DPI fullscreen output.
 * Textures outside the render ring are still
 * bounded by the cache below.
 */
const MAX_PREVIEW_TEXTURE_SIZE =
  2560

/*
 * Open paths retain the complete 21-slot
 * preload ring plus a small recently-used
 * reserve.
 *
 * A texture is therefore not discarded while
 * its card is anywhere near the viewport.
 */
const MAX_TEXTURE_CACHE =
  26

const SCROLL_SMOOTHING =
  8

const SCROLL_SENSITIVITY =
  0.0016

function faceCameraQuaternion(
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
) {
  const normal =
    camera.position.clone().sub(position).normalize()

  const right =
    new THREE.Vector3().crossVectors(camera.up, normal).normalize()

  const up =
    new THREE.Vector3().crossVectors(normal, right).normalize()

  const basis =
    new THREE.Matrix4().makeBasis(right, up, normal)

  return new THREE.Quaternion().setFromRotationMatrix(basis)
}

function applyCardLayout(slots: RenderSlot[], scale: number) {
  for (const slot of slots) {
    if (slot.imageIndex === null) {
      slot.mesh.visible = false
      continue
    }

    slot.mesh.scale.set(scale, scale, 1)
    slot.mesh.frustumCulled = true
    slot.mesh.visible = true
  }
}

function sampleOpenPathFrames(
  compiled: CompiledParametricEquation,
  table: ArcLengthTable,
  count: number,
  infinite: boolean,
  spacing: number,
  camera: THREE.PerspectiveCamera,
  orientation: CarouselCardOrientation,
): CardPose[][] {
  const frames: CardPose[][] = []
  const phaseCount = infinite ? 24 : Math.min(48, Math.max(12, count * 3))

  for (let phaseIndex = 0; phaseIndex <= phaseCount; phaseIndex += 1) {
    const position = infinite
      ? phaseIndex / phaseCount
      : (Math.max(0, count - 1) * phaseIndex) / phaseCount
    const centre = Math.round(position)
    const first = infinite ? centre - RENDER_RADIUS : Math.max(0, centre - RENDER_RADIUS)
    const last = infinite ? centre + RENDER_RADIUS : Math.min(count - 1, centre + RENDER_RADIUS)
    const frame: CardPose[] = []

    for (let index = first; index <= last; index += 1) {
      const arc = (index - position) * spacing
      const t = tAtSignedArcDistance(table, arc)
      const point = toThreeCoordinates(evaluateCompiledEquation(compiled, t))

      if (![point.x, point.y, point.z].every(Number.isFinite)) continue

      frame.push({
        position: new THREE.Vector3(point.x, point.y, point.z),
        quaternion: orientation === 'camera'
          ? faceCameraQuaternion(new THREE.Vector3(point.x, point.y, point.z), camera)
          : new THREE.Quaternion(),
      })
    }

    frames.push(frame)
  }

  return frames
}

function openPathFramesFit(
  frames: CardPose[][],
  camera: THREE.PerspectiveCamera,
): boolean {
  return frames.every(frame => {
    const bounds = frame
      .map(card => projectCardBounds(card, camera, 1.04))
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => a.left - b.left)

    for (let index = 0; index < bounds.length; index += 1) {
      for (let next = index + 1; next < bounds.length && bounds[next].left < bounds[index].right; next += 1) {
        if (boundsOverlap(bounds[index], bounds[next])) return false
      }
    }

    return true
  })
}

function calculateOpenPathSpacing(
  compiled: CompiledParametricEquation,
  table: ArcLengthTable,
  count: number,
  infinite: boolean,
  camera: THREE.PerspectiveCamera,
  orientation: CarouselCardOrientation,
): number {
  camera.updateMatrixWorld()

  for (let spacing = WALLPAPER_SPACING; spacing <= MAX_OPEN_SPACING; spacing += 0.25) {
    if (openPathFramesFit(sampleOpenPathFrames(compiled, table, count, infinite, spacing, camera, orientation), camera)) {
      return spacing
    }
  }

  return MAX_OPEN_SPACING
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  )
}

function positiveModulo(
  value: number,
  modulus: number,
) {
  if (
    modulus <=
    0
  ) {
    return 0
  }

  return (
    (
      value %
        modulus
    ) +
    modulus
  ) %
    modulus
}

/*
 * ============================================================
 * SCREEN COIL
 * ============================================================
 *
 * This is deliberately NOT ordinary
 * arc-length spacing.
 *
 * Every integer carousel position must place
 * every slot exactly on one grid point.
 *
 * Between integers each slot follows the same
 * 2D looping segment to the next grid point.
 */


/*
 * Choose a near-square rectangle so 16:9
 * cards collectively fill a 16:9 screen well.
 *
 * A Hamiltonian grid cycle requires at least
 * one dimension to be even.
 *
 * If the image count does not exactly fill
 * that rectangle, some wallpapers repeat.
 * That is intentional: there are no empty
 * holes in a completed grid.
 */
function chooseScreenCoilDimensions(
  imageCount:
    number,
) {
  if (
    imageCount <=
    1
  ) {
    return {
      rows:
        1,

      columns:
        1,
    }
  }

  const maxDimension =
    Math.max(
      4,

      Math.ceil(
        Math.sqrt(
          imageCount,
        ),
      ) +
        5,
    )

  let best:
    | {
        rows:
          number

        columns:
          number

        score:
          number
      }
    | null =
    null

  for (
    let rows = 2;
    rows <=
    maxDimension;
    rows +=
    1
  ) {
    for (
      let columns = 2;
      columns <=
      maxDimension;
      columns +=
      1
    ) {
      const slots =
        rows *
        columns

      if (
        slots <
        imageCount
      ) {
        continue
      }

      /*
       * Odd x odd rectangular grids cannot
       * have the closed neighbour-to-neighbour
       * cycle we need.
       */
      if (
        rows %
          2 !==
          0 &&
        columns %
          2 !==
          0
      ) {
        continue
      }

      const repeats =
        slots -
        imageCount

      /*
       * Because both the screen and cards are
       * 16:9, a roughly square count of cards
       * gives the best screen coverage.
       */
      const shapePenalty =
        Math.abs(
          Math.log(
            columns /
            rows,
          ),
        ) *
        10

      const imbalancePenalty =
        Math.abs(
          columns -
          rows,
        ) *
        0.15

      const score =
        repeats +
        shapePenalty +
        imbalancePenalty

      if (
        !best ||
        score <
          best.score
      ) {
        best = {
          rows,
          columns,
          score,
        }
      }
    }
  }

  return (
    best ?? {
      rows:
        2,

      columns:
        Math.max(
          2,
          Math.ceil(
            imageCount /
            2,
          ),
        ),
    }
  )
}


/*
 * Hamiltonian cycle for a rectangle whose
 * column count is even.
 *
 * Every successive point is horizontally or
 * vertically adjacent and the final point is
 * adjacent to the first.
 */
function buildEvenColumnCycle(
  rows:
    number,

  columns:
    number,
) {
  const result:
    Array<
      [
        number,
        number,
      ]
    > = []

  result.push(
    [
      0,
      0,
    ],
  )

  /*
   * First column: top -> bottom.
   */
  for (
    let row = 1;
    row <
    rows;
    row +=
    1
  ) {
    result.push(
      [
        row,
        0,
      ],
    )
  }

  /*
   * Interior columns snake upward/downward
   * but deliberately leave row 0 unused.
   */
  for (
    let column = 1;
    column <
    columns;
    column +=
    1
  ) {
    if (
      column %
        2 ===
      1
    ) {
      for (
        let row =
          rows -
          1;

        row >=
        1;

        row -=
        1
      ) {
        result.push(
          [
            row,
            column,
          ],
        )
      }
    } else {
      for (
        let row = 1;
        row <
        rows;
        row +=
        1
      ) {
        result.push(
          [
            row,
            column,
          ],
        )
      }
    }
  }

  /*
   * Return along the unused top row.
   */
  for (
    let column =
      columns -
      1;

    column >=
    1;

    column -=
    1
  ) {
    result.push(
      [
        0,
        column,
      ],
    )
  }

  return result
}


function buildScreenCoilCycle(
  rows:
    number,

  columns:
    number,
) {
  if (
    rows ===
      1 &&
    columns ===
      1
  ) {
    return [
      [
        0,
        0,
      ] as [
        number,
        number,
      ],
    ]
  }

  if (
    columns %
      2 ===
    0
  ) {
    return buildEvenColumnCycle(
      rows,
      columns,
    )
  }

  /*
   * Rows are therefore even.
   * Build the cycle in the transposed grid and
   * swap coordinates back.
   */
  return buildEvenColumnCycle(
    columns,
    rows,
  ).map(
    (
      [
        row,
        column,
      ],
    ) =>
      [
        column,
        row,
      ] as [
        number,
        number,
      ],
  )
}


function screenCoilSlotCount(
  imageCount:
    number,
) {
  if (
    imageCount <=
    0
  ) {
    return 0
  }

  const {
    rows,
    columns,
  } =
    chooseScreenCoilDimensions(
      imageCount,
    )

  return (
    rows *
    columns
  )
}


function createScreenCoilLayout(
  imageCount:
    number,

  cameraAspect:
    number,

  cameraFov:
    number,
): ScreenCoilLayout {
  const {
    rows,
    columns,
  } =
    chooseScreenCoilDimensions(
      imageCount,
    )

  const slotCount =
    rows *
    columns

  if (
    imageCount <=
    0 ||
    slotCount <=
    0
  ) {
    return {
      rows:
        0,

      columns:
        0,

      slotCount:
        0,

      points:
        [],

      cardScale:
        1,
    }
  }

  /*
   * Visible dimensions at logical Y=0 /
   * Three.js world Z=0 with the flat Screen
   * Coil camera at z=BASE_CAMERA_Z.
   */
  const visibleHeight =
    2 *
    Math.tan(
      THREE.MathUtils.degToRad(
        cameraFov,
      ) /
        2,
    ) *
    BASE_CAMERA_Z

  const visibleWidth =
    visibleHeight *
    cameraAspect

  /*
   * Small gaps keep individual wallpapers
   * readable while still filling almost all
   * of the viewport.
   */
  const gapFraction =
    0.06

  const horizontalUnits =
    CARD_WIDTH *
    (
      columns +
      (
        columns -
        1
      ) *
        gapFraction
    )

  const verticalUnits =
    CARD_HEIGHT *
    (
      rows +
      (
        rows -
        1
      ) *
        gapFraction
    )

  const cardScale =
    Math.min(
      1.1,

      (
        visibleWidth *
        0.94
      ) /
        horizontalUnits,

      (
        visibleHeight *
        0.88
      ) /
        verticalUnits,
    )

  const spacingX =
    CARD_WIDTH *
    cardScale *
    (
      1 +
      gapFraction
    )

  const spacingZ =
    CARD_HEIGHT *
    cardScale *
    (
      1 +
      gapFraction
    )

  const cycle =
    buildScreenCoilCycle(
      rows,
      columns,
    )

  const points =
    cycle.map(
      (
        [
          row,
          column,
        ],
      ): Point3 => ({
        x:
          (
            column -
            (
              columns -
              1
            ) /
              2
          ) *
          spacingX,

        /*
         * SCREEN COIL IS STRICTLY 2D.
         *
         * Logical Y maps to Three.js depth.
         */
        y:
          0,

        z:
          (
            (
              rows -
              1
            ) /
              2 -
            row
          ) *
          spacingZ,
      }),
    )

  return {
    rows,
    columns,
    slotCount,
    points,
    cardScale,
  }
}


/*
 * Evaluate one synchronized Screen Coil path
 * position.
 *
 * Integer values are EXACT grid locations.
 *
 * Fractional values make one full 2D loop
 * between adjacent grid points.
 */
function screenCoilPointAt(
  layout:
    ScreenCoilLayout,

  parameter:
    number,
): Point3 {
  const count =
    layout.points.length

  if (
    count <=
    0
  ) {
    return {
      x: 0,
      y: 0,
      z: 0,
    }
  }

  if (
    count ===
    1
  ) {
    return {
      ...layout.points[
        0
      ],
    }
  }

  const base =
    Math.floor(
      parameter,
    )

  const u =
    parameter -
    base

  const from =
    layout.points[
      positiveModulo(
        base,
        count,
      )
    ]

  const to =
    layout.points[
      positiveModulo(
        base +
          1,
        count,
      )
    ]

  const dx =
    to.x -
    from.x

  const dz =
    to.z -
    from.z

  const length =
    Math.sqrt(
      dx *
        dx +
      dz *
        dz,
    )

  if (
    length <=
    0.000001
  ) {
    return {
      ...from,
    }
  }

  const directionX =
    dx /
    length

  const directionZ =
    dz /
    length

  /*
   * Perpendicular direction in the flat
   * X/Z plane.
   */
  const normalX =
    -directionZ

  const normalZ =
    directionX

  /*
   * Slightly more than L/(2π) causes the
   * along-axis component to briefly reverse,
   * producing an actual little loop rather
   * than merely a sine wave.
   */
  const radius =
    length *
    0.18

  const angle =
    u *
    Math.PI *
    2

  const along =
    length *
      u +
    radius *
      Math.sin(
        angle,
      )

  /*
   * Alternate the side of each grid segment.
   */
  const sideSign =
    positiveModulo(
      base,
      2,
    ) ===
      0
      ? 1
      : -1

  const sideways =
    sideSign *
    radius *
    (
      1 -
      Math.cos(
        angle,
      )
    )

  return {
    x:
      from.x +
      directionX *
        along +
      normalX *
        sideways,

    /*
     * Never move toward or away from camera.
     */
    y:
      0,

    z:
      from.z +
      directionZ *
        along +
      normalZ *
        sideways,
  }
}


function scaleClosedLoopPoint(
  point:
    Point3,

  center:
    Point3,

  scale:
    number,
): Point3 {
  return {
    x:
      center.x +
      (
        point.x -
        center.x
      ) *
        scale,

    y:
      center.y +
      (
        point.y -
        center.y
      ) *
        scale,

    z:
      center.z +
      (
        point.z -
        center.z
      ) *
        scale,
  }
}


/*
 * A closed equation has a finite circumference.
 *
 * Equal arc-length splitting is correct, but
 * there is a separate physical constraint:
 *
 *     circumference / imageCount
 *
 * must be large enough for the width of a
 * wallpaper card.
 *
 * When it is not, enlarge the whole closed
 * path uniformly. This preserves the curve's
 * shape while preventing neighbours from
 * occupying the same space.
 */
function calculateClosedLoopLayout(
  equation:
    CompiledParametricEquation,

  table:
    ArcLengthTable,

  imageCount:
    number,
): ClosedLoopLayout {
  const fallback:
    ClosedLoopLayout = {
    center: {
      x: 0,
      y: 0,
      z: 0,
    },

    scale:
      1,

    cameraZ:
      BASE_CAMERA_Z,
  }

  if (
    imageCount <=
      0 ||
    table.totalLength <=
      0
  ) {
    return fallback
  }

  const samples =
    256

  const points:
    Point3[] =
    []

  let sumX =
    0

  let sumY =
    0

  let sumZ =
    0

  for (
    let index = 0;
    index <
    samples;
    index +=
    1
  ) {
    const arc =
      (
        index /
        samples
      ) *
      table.totalLength

    const t =
      tAtArcLength(
        table,
        arc,
      )

    try {
      const point =
        evaluateCompiledEquation(
          equation,
          t,
        )

      if (
        Number.isFinite(
          point.x,
        ) &&
        Number.isFinite(
          point.y,
        ) &&
        Number.isFinite(
          point.z,
        )
      ) {
        points.push(
          point,
        )

        sumX +=
          point.x

        sumY +=
          point.y

        sumZ +=
          point.z
      }
    } catch {
      // Ignore invalid samples.
    }
  }

  if (
    points.length ===
    0
  ) {
    return fallback
  }

  const center:
    Point3 = {
    x:
      sumX /
      points.length,

    y:
      sumY /
      points.length,

    z:
      sumZ /
      points.length,
  }

  const requiredLength =
    imageCount *
    (
      CARD_WIDTH +
      CLOSED_LOOP_CARD_GAP
    )

  const scale =
    Math.max(
      1,

      requiredLength /
      table.totalLength,
    )

  /*
   * Find the front-most point after scaling.
   *
   * Equation Y maps to Three.js world Z.
   * Put the camera another BASE_CAMERA_Z
   * units in front of that point.
   */
  let maximumWorldZ =
    -Infinity

  for (
    const rawPoint
    of points
  ) {
    const point =
      scaleClosedLoopPoint(
        rawPoint,
        center,
        scale,
      )

    const world =
      toThreeCoordinates(
        point,
      )

    maximumWorldZ =
      Math.max(
        maximumWorldZ,
        world.z,
      )
  }

  return {
    center,

    scale,

    cameraZ:
      Number.isFinite(
        maximumWorldZ,
      )
        ? Math.max(
            BASE_CAMERA_Z,
            maximumWorldZ +
              BASE_CAMERA_Z,
          )
        : BASE_CAMERA_Z,
  }
}


function brightnessAtPoint(
  point: Point3,
  center: Point3,
  minimum: number,
  softening: number,
) {
  const dx =
    point.x -
    center.x

  const dy =
    point.y -
    center.y

  const dz =
    point.z -
    center.z

  const r2 =
    dx * dx +
    dy * dy +
    dz * dz

  const radius =
    Math.max(
      0.01,
      softening,
    )

  const s2 =
    radius *
    radius

  const inverseSquare =
    s2 /
    (
      r2 +
      s2
    )

  const min =
    clamp(
      minimum,
      0,
      1,
    )

  return (
    min +
    (
      1 -
      min
    ) *
      inverseSquare
  )
}

function cropTextureTo169(
  texture:
    THREE.Texture,
) {
  const image =
    texture.image as
      | {
          width?: number
          height?: number
        }
      | undefined

  const width =
    image?.width ??
    0

  const height =
    image?.height ??
    0

  if (
    width <=
      0 ||
    height <=
      0
  ) {
    return
  }

  const sourceAspect =
    width /
    height

  const targetAspect =
    16 /
    9

  texture.wrapS =
    THREE.ClampToEdgeWrapping

  texture.wrapT =
    THREE.ClampToEdgeWrapping

  texture.repeat.set(
    1,
    1,
  )

  texture.offset.set(
    0,
    0,
  )

  if (
    sourceAspect >
    targetAspect
  ) {
    const repeat =
      targetAspect /
      sourceAspect

    texture.repeat.x =
      repeat

    texture.offset.x =
      (
        1 -
        repeat
      ) /
      2
  } else if (
    sourceAspect <
    targetAspect
  ) {
    const repeat =
      sourceAspect /
      targetAspect

    texture.repeat.y =
      repeat

    texture.offset.y =
      (
        1 -
        repeat
      ) /
      2
  }

  texture.needsUpdate =
    true
}

function optimiseTexture(
  original:
    THREE.Texture,
): THREE.Texture {
  const image =
    original.image as
      | {
          width?: number
          height?: number
        }
      | undefined

  const width =
    image?.width ??
    0

  const height =
    image?.height ??
    0

  let texture =
    original

  if (
    width >
      MAX_PREVIEW_TEXTURE_SIZE ||
    height >
      MAX_PREVIEW_TEXTURE_SIZE
  ) {
    const scale =
      Math.min(
        MAX_PREVIEW_TEXTURE_SIZE /
          width,

        MAX_PREVIEW_TEXTURE_SIZE /
          height,
      )

    const targetWidth =
      Math.max(
        1,
        Math.round(
          width *
          scale,
        ),
      )

    const targetHeight =
      Math.max(
        1,
        Math.round(
          height *
          scale,
        ),
      )

    const canvas =
      document.createElement(
        'canvas',
      )

    canvas.width =
      targetWidth

    canvas.height =
      targetHeight

    const context =
      canvas.getContext(
        '2d',
      )

    if (
      context
    ) {
      context.drawImage(
        original.image as
          CanvasImageSource,

        0,
        0,

        targetWidth,
        targetHeight,
      )

      texture =
        new THREE.CanvasTexture(
          canvas,
        )

      original.dispose()
    }
  }

  texture.colorSpace =
    THREE.SRGBColorSpace

  texture.generateMipmaps =
    true

  texture.minFilter =
    THREE.LinearMipmapLinearFilter

  texture.magFilter =
    THREE.LinearFilter

  cropTextureTo169(
    texture,
  )

  texture.needsUpdate =
    true

  return texture
}

function loadPreviewTexture(
  path: string,
) {
  return new Promise<
    THREE.Texture
  >(
    (
      resolve,
      reject,
    ) => {
      const loader =
        new THREE.TextureLoader()

      loader.load(
        convertFileSrc(
          path,
        ),

        (
          texture,
        ) => {
          resolve(
            optimiseTexture(
              texture,
            ),
          )
        },

        undefined,

        reject,
      )
    },
  )
}

export function Carousel({
  items,
  positionRef,
  equation,
  onScroll,
  fadeAmount = 55,
  centerPoint = {
    x: 0,
    y: 0,
    z: 0,
  },
  minBrightness = 0.15,
  brightnessSoftening = 2.5,
  infiniteScroll = false,
  closedLoop = false,
  cardOrientation = 'camera',
  onViewAspectChange,
  transparentBackground = false,
  onItemClick,
  persistConfiguration = true,
}: CarouselProps) {
  /*
   * Screen Coil is now an ordinary equation
   * preset rather than the old synchronized
   * grid renderer.
   */
    /*
   * Old experimental Screen Coil renderer
   * disabled. Screen Coil is no longer a
   * preset.
   */
  const screenCoil =
    false



  const containerRef =
    useRef<HTMLDivElement>(
      null,
    )

  const sceneRef =
    useRef<
      THREE.Scene | null
    >(null)

  const geometryRef =
    useRef<
      THREE.PlaneGeometry | null
    >(null)

  const slotsRef =
    useRef<
      RenderSlot[]
    >([])

  const compiledRef =
    useRef<
      CompiledParametricEquation | null
    >(null)

  const openArcRef =
    useRef<
      ArcLengthTable | null
    >(null)

  const closedArcRef =
    useRef<
      ArcLengthTable | null
    >(null)


  const closedLoopLayoutRef =
    useRef<ClosedLoopLayout>({
      center: {
        x: 0,
        y: 0,
        z: 0,
      },

      scale:
        1,

      cameraZ:
        BASE_CAMERA_Z,
    })

  const texturesRef =
    useRef<
      Map<
        string,
        CachedTexture
      >
    >(
      new Map(),
    )

  const maxAnisotropyRef =
    useRef(1)

  const pendingRef =
    useRef<
      Set<string>
    >(
      new Set(),
    )

  const destroyedRef =
    useRef(
      false,
    )

  const itemsRef =
    useRef(
      items,
    )

  const fadeRef =
    useRef(
      fadeAmount,
    )

  const centerRef =
    useRef(
      centerPoint,
    )

  const minimumRef =
    useRef(
      minBrightness,
    )

  const softeningRef =
    useRef(
      brightnessSoftening,
    )

  const infiniteRef =
    useRef(
      infiniteScroll,
    )

  const closedLoopRef =
    useRef(
      closedLoop,
    )

  const cardOrientationRef =
    useRef<CarouselCardOrientation>(
      cardOrientation,
    )


  const screenCoilRef =
    useRef(
      screenCoil,
    )

  const screenCoilLayoutCacheRef =
    useRef<{
      imageCount:
        number

      aspect:
        number

      layout:
        ScreenCoilLayout
    } | null>(
      null,
    )

  const onScrollRef =
    useRef(
      onScroll,
    )

  const onItemClickRef =
    useRef(
      onItemClick,
    )

  const smoothPositionRef =
    useRef(
      positionRef.current ??
      0,
    )

  const itemsKey =
    useMemo(
      () =>
        items
          .map(
            (
              item,
            ) =>
              item.id,
          )
          .join(
            '\u0001',
          ),
      [
        items,
      ],
    )

  itemsRef.current =
    items

  fadeRef.current =
    fadeAmount

  centerRef.current =
    centerPoint

  minimumRef.current =
    minBrightness

  softeningRef.current =
    brightnessSoftening

  infiniteRef.current =
    infiniteScroll

  closedLoopRef.current =
    closedLoop

  cardOrientationRef.current =
    cardOrientation


  screenCoilRef.current =
    screenCoil

  onScrollRef.current =
    onScroll

  onItemClickRef.current =
    onItemClick

  /*
   * ==========================================================
   * PERSIST ACTIVE CAROUSEL
   * ==========================================================
   *
   * CarouselPage does not need special save
   * logic. Whatever it currently passes here
   * becomes the configuration used next time
   * the tray overlay is opened.
   */

  useEffect(() => {
    if (
      !persistConfiguration
    ) {
      return
    }

    saveCarouselConfiguration({
      equation: {
        x:
          equation.x,

        y:
          equation.y,

        z:
          equation.z,
      },

      fadeAmount,

      centerPoint: {
        x:
          centerPoint.x,

        y:
          centerPoint.y,

        z:
          centerPoint.z,
      },

      minBrightness,

      brightnessSoftening,

      infiniteScroll,

      closedLoop,

      cardOrientation,
    })
  }, [
    persistConfiguration,

    equation.x,
    equation.y,
    equation.z,

    fadeAmount,

    centerPoint.x,
    centerPoint.y,
    centerPoint.z,

    minBrightness,
    brightnessSoftening,

    infiniteScroll,
    closedLoop,
    cardOrientation,
  ])


  /*
   * ==========================================================
   * ARC-LENGTH PARAMETERISATION
   * ==========================================================
   */

  useEffect(() => {
    try {
      const compiled =
        compileParametricEquation(
          equation,
        )

      compiledRef.current =
        compiled

      if (
        screenCoil
      ) {
        /*
         * Screen Coil uses synchronized grid
         * segment units, not physical arc
         * distance.
         */
        openArcRef.current =
          null

        closedArcRef.current =
          null

        closedLoopLayoutRef.current = {
          center: {
            x: 0,
            y: 0,
            z: 0,
          },

          scale:
            1,

          cameraZ:
            BASE_CAMERA_Z,
        }
      } else if (
        closedLoop
      ) {
        const table =
          buildArcLengthTable(
            compiled,
            0,
            Math.PI *
              2,
            4096,
          )

        closedArcRef.current =
          table

        closedLoopLayoutRef.current =
          calculateClosedLoopLayout(
            compiled,
            table,
            items.length,
          )

        openArcRef.current =
          null
      } else {
        closedLoopLayoutRef.current = {
          center: {
            x: 0,
            y: 0,
            z: 0,
          },

          scale:
            1,

          cameraZ:
            BASE_CAMERA_Z,
        }
        openArcRef.current =
          buildOpenArcLengthTable(
            compiled,
            OPEN_ARC_DISTANCE,
          )

        closedArcRef.current =
          null
      }

    } catch (error) {
      console.warn(
        'Failed to build arc-length table:',
        error,
      )

      compiledRef.current =
        null

      openArcRef.current =
        null

      closedArcRef.current =
        null

    }
  }, [
    equation.x,
    equation.y,
    equation.z,
    closedLoop,
    screenCoil,
    items.length,
  ])

  /*
   * ==========================================================
   * TEXTURE CACHE
   * ==========================================================
   */

  function activeImageIds() {
    const ids =
      new Set<string>()

    const currentItems =
      itemsRef.current

    for (
      const slot
      of slotsRef.current
    ) {
      if (
        slot.imageIndex ===
        null
      ) {
        continue
      }

      const item =
        currentItems[
          slot.imageIndex
        ]

      if (
        item
      ) {
        ids.add(
          item.id,
        )
      }
    }

    return ids
  }

  function evictTextures() {
    const cache =
      texturesRef.current

    if (
      cache.size <=
      MAX_TEXTURE_CACHE
    ) {
      return
    }

    const active =
      activeImageIds()

    const candidates =
      [
        ...cache.entries(),
      ]
        .filter(
          (
            [
              id,
            ],
          ) =>
            !active.has(
              id,
            ),
        )
        .sort(
          (
            a,
            b,
          ) =>
            a[1].lastUsed -
            b[1].lastUsed,
        )

    for (
      const [
        id,
        entry,
      ]
      of candidates
    ) {
      if (
        cache.size <=
        MAX_TEXTURE_CACHE
      ) {
        break
      }

      entry.texture.dispose()

      cache.delete(
        id,
      )
    }
  }

  function requestTexture(
    imageIndex:
      number,
  ) {
    const item =
      itemsRef.current[
        imageIndex
      ]

    if (
      !item
    ) {
      return
    }

    const cached =
      texturesRef.current.get(
        item.id,
      )

    if (
      cached
    ) {
      cached.lastUsed =
        performance.now()

      return
    }

    if (
      pendingRef.current.has(
        item.id,
      )
    ) {
      return
    }

    pendingRef.current.add(
      item.id,
    )

    loadPreviewTexture(
      item.path,
    )
      .then(
        (
          texture,
        ) => {
          texture.anisotropy =
            maxAnisotropyRef.current

          texture.needsUpdate =
            true

          pendingRef.current.delete(
            item.id,
          )

          if (
            destroyedRef.current
          ) {
            texture.dispose()

            return
          }

          texturesRef.current.set(
            item.id,
            {
              texture,
              lastUsed:
                performance.now(),
            },
          )

          /*
           * A texture may finish loading after
           * a slot was already assigned.
           */
          for (
            const slot
            of slotsRef.current
          ) {
            if (
              slot.imageIndex ===
              null
            ) {
              continue
            }

            const slotItem =
              itemsRef.current[
                slot.imageIndex
              ]

            if (
              slotItem?.id ===
              item.id
            ) {
              slot.material.map =
                texture

              slot.textureOpacity =
                1

              slot.material.needsUpdate =
                true
            }
          }

          evictTextures()
        },
      )
      .catch(
        (
          error,
        ) => {
          pendingRef.current.delete(
            item.id,
          )

          console.warn(
            'Failed to load wallpaper texture:',
            item.path,
            error,
          )
        },
      )
  }

  function assignSlotImage(
    slot:
      RenderSlot,
    imageIndex:
      number,
  ) {
    slot.imageIndex =
      imageIndex

    const item =
      itemsRef.current[
        imageIndex
      ]

    if (
      !item
    ) {
      slot.material.map =
        null

      slot.material.needsUpdate =
        true

      return
    }

    const cached =
      texturesRef.current.get(
        item.id,
      )

    if (
      cached
    ) {
      cached.lastUsed =
        performance.now()

      slot.material.map =
        cached.texture

      /*
       * Already decoded while this card was
       * outside the view. Show immediately.
       */
      slot.textureOpacity =
        1

      slot.material.needsUpdate =
        true

      return
    }

    slot.material.map =
      null

    slot.material.needsUpdate =
      true

    requestTexture(
      imageIndex,
    )
  }

  /*
   * Remove cached images no longer in the
   * selected playlist.
   */
  useEffect(() => {
    const validIds =
      new Set(
        items.map(
          (
            item,
          ) =>
            item.id,
        ),
      )

    for (
      const [
        id,
        entry,
      ]
      of texturesRef.current
    ) {
      if (
        !validIds.has(
          id,
        )
      ) {
        entry.texture.dispose()

        texturesRef.current.delete(
          id,
        )
      }
    }
  }, [
    itemsKey,
  ])

  useEffect(() => {
    const preloadCount = Math.min(items.length, MAX_TEXTURE_CACHE)
    for (let index = 0; index < preloadCount; index += 1) {
      requestTexture(index)
    }
  }, [itemsKey])

  /*
   * ==========================================================
   * THREE.JS RENDERER
   * ==========================================================
   */

  useEffect(() => {
    destroyedRef.current =
      false

    const container =
      containerRef.current

    if (
      !container
    ) {
      return
    }

    const scene =
      new THREE.Scene()

    scene.background =
      transparentBackground
        ? null
        : new THREE.Color(
            0x0d0f13,
          )

    const camera =
      new THREE.PerspectiveCamera(
        CAROUSEL_CAMERA_FOV,
        1,
        CAROUSEL_CAMERA_NEAR,
        CAROUSEL_CAMERA_FAR,
      )

    camera.position.set(
      0,
      0,
      BASE_CAMERA_Z,
    )

    camera.lookAt(
      0,
      0,
      0,
    )

    const renderer =
      new THREE.WebGLRenderer({
        antialias:
          true,

        alpha:
          transparentBackground,

        powerPreference:
          'high-performance',
      })

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2,
      ),
    )

    renderer.outputColorSpace =
      THREE.SRGBColorSpace

    maxAnisotropyRef.current =
      renderer.capabilities
        .getMaxAnisotropy()

    if (
      transparentBackground
    ) {
      renderer.setClearColor(
        0x000000,
        0,
      )
    }

    renderer.domElement.style.cursor =
      onItemClickRef.current
        ? 'pointer'
        : 'default'

    container.appendChild(
      renderer.domElement,
    )

    const geometry =
      new THREE.PlaneGeometry(
        CARD_WIDTH,
        CARD_HEIGHT,
      )

    sceneRef.current =
      scene

    geometryRef.current =
      geometry

    const resize = () => {
      const width =
        container.clientWidth

      const height =
        container.clientHeight

      if (
        width <
          2 ||
        height <
          2
      ) {
        return
      }

      const aspect =
        width /
        height

      camera.aspect =
        aspect

      camera.updateProjectionMatrix()

      onViewAspectChange?.(
        aspect,
      )

      renderer.setSize(
        width,
        height,
        false,
      )
    }

    const resizeObserver =
      new ResizeObserver(
        resize,
      )

    resizeObserver.observe(
      container,
    )

    requestAnimationFrame(
      resize,
    )

    const handleWheel = (
      event:
        WheelEvent,
    ) => {
      event.preventDefault()

      onScrollRef.current(
        event.deltaY *
          SCROLL_SENSITIVITY,
      )
    }

    container.addEventListener(
      'wheel',
      handleWheel,
      {
        passive:
          false,
      },
    )

    /*
     * --------------------------------------------------------
     * WALLPAPER CLICK RAYCASTING
     * --------------------------------------------------------
     *
     * Used by the fullscreen wallpaper picker.
     *
     * A small movement tolerance prevents a
     * click being accidentally generated by
     * a pointer drag.
     */

    const raycaster =
      new THREE.Raycaster()

    const clickPointer =
      new THREE.Vector2()

    let pointerDownX =
      0

    let pointerDownY =
      0

    const handleWallpaperPointerDown =
      (
        event:
          PointerEvent,
      ) => {
        if (
          event.button !==
          0
        ) {
          return
        }

        pointerDownX =
          event.clientX

        pointerDownY =
          event.clientY
      }

    const handleWallpaperPointerUp =
      (
        event:
          PointerEvent,
      ) => {
        const callback =
          onItemClickRef.current

        if (
          !callback ||
          event.button !==
            0
        ) {
          return
        }

        const dx =
          event.clientX -
          pointerDownX

        const dy =
          event.clientY -
          pointerDownY

        if (
          dx * dx +
          dy * dy >
          64
        ) {
          return
        }

        const rect =
          renderer.domElement
            .getBoundingClientRect()

        if (
          rect.width <=
            0 ||
          rect.height <=
            0
        ) {
          return
        }

        clickPointer.x =
          (
            (
              event.clientX -
              rect.left
            ) /
            rect.width
          ) *
            2 -
          1

        clickPointer.y =
          -(
            (
              event.clientY -
              rect.top
            ) /
            rect.height
          ) *
            2 +
          1

        raycaster.setFromCamera(
          clickPointer,
          camera,
        )

        const clickable =
          slotsRef.current
            .filter(
              (
                slot,
              ) =>
                slot.mesh.visible &&
                slot.imageIndex !==
                  null,
            )
            .map(
              (
                slot,
              ) =>
                slot.mesh,
            )

        const hits =
          raycaster.intersectObjects(
            clickable,
            false,
          )

        if (
          hits.length ===
          0
        ) {
          return
        }

        const hitMesh =
          hits[0]
            .object

        const slot =
          slotsRef.current.find(
            (
              current,
            ) =>
              current.mesh ===
              hitMesh,
          )

        if (
          !slot ||
          slot.imageIndex ===
            null
        ) {
          return
        }

        const item =
          itemsRef.current[
            slot.imageIndex
          ]

        if (
          item
        ) {
          callback(
            item,
          )
        }
      }

    renderer.domElement.addEventListener(
      'pointerdown',
      handleWallpaperPointerDown,
    )

    renderer.domElement.addEventListener(
      'pointerup',
      handleWallpaperPointerUp,
    )

    /*
     * --------------------------------------------------------
     * OPEN PATH MESH RECYCLING
     * --------------------------------------------------------
     */

    function reconcileOpenSlots(
      position: number,
    ) {
      const slots =
        slotsRef.current

      const count =
        itemsRef.current
          .length

      if (
        count <=
        0
      ) {
        for (
          const slot
          of slots
        ) {
          slot.mesh.visible =
            false
        }

        return
      }

      const centre =
        Math.round(
          position,
        )

      const desired:
        number[] =
        []

      for (
        let offset =
          -RENDER_RADIUS;

        offset <=
        RENDER_RADIUS;

        offset +=
        1
      ) {
        const virtualIndex =
          centre +
          offset

        if (
          infiniteRef.current
        ) {
          desired.push(
            virtualIndex,
          )
        } else if (
          virtualIndex >=
            0 &&
          virtualIndex <
            count
        ) {
          desired.push(
            virtualIndex,
          )
        }
      }

      const desiredSet =
        new Set(
          desired,
        )

      const existing =
        new Map<
          number,
          RenderSlot
        >()

      const reusable:
        RenderSlot[] =
        []

      for (
        const slot
        of slots
      ) {
        if (
          slot.virtualIndex !==
            null &&
          desiredSet.has(
            slot.virtualIndex,
          )
        ) {
          existing.set(
            slot.virtualIndex,
            slot,
          )
        } else {
          reusable.push(
            slot,
          )
        }
      }

      for (
        const virtualIndex
        of desired
      ) {
        let slot =
          existing.get(
            virtualIndex,
          )

        if (
          !slot
        ) {
          slot =
            reusable.pop()

          if (
            !slot
          ) {
            continue
          }

          slot.virtualIndex =
            virtualIndex

          slot.imageIndex =
            null
        }

        const imageIndex =
          infiniteRef.current
            ? positiveModulo(
                virtualIndex,
                count,
              )
            : virtualIndex

        if (
          slot.imageIndex !==
          imageIndex
        ) {
          assignSlotImage(
            slot,
            imageIndex,
          )
        }

        slot.mesh.visible =
          true
      }

      for (
        const slot
        of reusable
      ) {
        slot.virtualIndex =
          null

        slot.imageIndex =
          null

        slot.mesh.visible =
          false

        slot.material.map =
          null

        slot.textureOpacity =
          0

        slot.material.opacity =
          0
      }
    }

    /*
     * --------------------------------------------------------
     * TEXTURE READINESS
     * --------------------------------------------------------
     *
     * The preload ring is the main mechanism
     * preventing texture pop-in.
     *
     * This fade only handles pathological
     * cases such as a huge image taking longer
     * than expected to decode.
     */
    function advanceTextureFade(
      slot:
        RenderSlot,

      delta:
        number,
    ) {
      if (
        !slot.material.map
      ) {
        slot.textureOpacity =
          0

        return
      }

      if (
        slot.textureOpacity >=
        1
      ) {
        return
      }

      slot.textureOpacity =
        Math.min(
          1,

          slot.textureOpacity +
            delta *
              6,
        )
    }


    /*
     * --------------------------------------------------------
     * ANIMATION
     * --------------------------------------------------------
     */

    const timer =
      new THREE.Timer()

    timer.connect(document)

    let frame =
      0

    let stopped =
      false

    let openSpacingCache: {
      compiled: CompiledParametricEquation
      count: number
      aspect: number
      infinite: boolean
      orientation: CarouselCardOrientation
      spacing: number
    } | null = null

    const animate = (timestamp?: number) => {
      if (
        stopped
      ) {
        return
      }

      frame =
        requestAnimationFrame(
          animate,
        )

      timer.update(
        timestamp,
      )

      const delta =
        Math.min(
          timer.getDelta(),
          0.05,
        )

      const target =
        positionRef.current ??
        0

      const smoothing =
        1 -
        Math.exp(
          -SCROLL_SMOOTHING *
          delta,
        )

      smoothPositionRef.current +=
        (
          target -
          smoothPositionRef.current
        ) *
        smoothing

      if (
        Math.abs(
          target -
          smoothPositionRef.current,
        ) <
        0.00001
      ) {
        smoothPositionRef.current =
          target
      }

      const position =
        smoothPositionRef.current

      const compiled =
        compiledRef.current

      const count =
        itemsRef.current
          .length


      /*
       * If a closed loop had to expand to fit
       * all cards, keep the camera outside the
       * front edge of that enlarged path.
       */
      const closedLayout =
        closedLoopLayoutRef.current

      const screenCoilActive =
        screenCoilRef.current

      const desiredCameraZ =
        screenCoilActive
          ? BASE_CAMERA_Z
          : closedLoopRef.current
            ? closedLayout.cameraZ
            : BASE_CAMERA_Z

      const desiredCameraY =
        screenCoilActive
          ? 0
          : 1.2

      // The view changes only with the layout, never with focus or scrolling.
      camera.position.set(0, desiredCameraY, desiredCameraZ)

      if (
        screenCoilActive
      ) {
        camera.lookAt(
          0,
          0,
          0,
        )
      } else if (
        closedLoopRef.current
      ) {
        const cameraTarget =
          toThreeCoordinates(
            closedLayout.center,
          )

        camera.lookAt(
          cameraTarget.x,
          cameraTarget.y,
          cameraTarget.z,
        )
      } else {
        camera.lookAt(
          0,
          0,
          0,
        )
      }

      if (
        !compiled ||
        count <=
          0
      ) {
        for (
          const slot
          of slotsRef.current
        ) {
          slot.mesh.visible =
            false
        }

        renderer.render(
          scene,
          camera,
        )

        return
      }

      if (!screenCoilActive && !closedLoopRef.current && (!openSpacingCache
        || openSpacingCache.compiled !== compiled || openSpacingCache.count !== count
        || openSpacingCache.aspect !== camera.aspect || openSpacingCache.infinite !== infiniteRef.current
        || openSpacingCache.orientation !== cardOrientationRef.current)) {
        let spacing = WALLPAPER_SPACING
        try {
          const table = openArcRef.current
          if (table) {
            spacing = calculateOpenPathSpacing(compiled, table, count, infiniteRef.current, camera, cardOrientationRef.current)
          }
        } catch (error) {
          console.warn('Could not calculate open-path card spacing:', error)
        }
        openSpacingCache = { compiled, count, aspect: camera.aspect, infinite: infiniteRef.current, orientation: cardOrientationRef.current, spacing }
      }

      const openSpacing = openSpacingCache?.spacing ?? WALLPAPER_SPACING

      /*
       * ------------------------------------------------------
       * CLOSED LOOP
       *
       * Split TOTAL measured circumference
       * evenly by image count.
       * ------------------------------------------------------
       */

      /*
       * ------------------------------------------------------
       * SYNCHRONIZED 2D SCREEN COIL
       * ------------------------------------------------------
       *
       * Each RenderSlot owns one grid position.
       *
       * At integer phase values every slot is
       * exactly on a grid waypoint.
       *
       * Between integers every slot traverses
       * the next connected grid edge with the
       * same fractional progress.
       */
      if (
        screenCoilRef.current
      ) {
        const aspect =
          Math.max(
            0.1,
            camera.aspect,
          )

        const cachedLayout =
          screenCoilLayoutCacheRef.current

        let layout:
          ScreenCoilLayout

        if (
          !cachedLayout ||
          cachedLayout.imageCount !==
            count ||
          Math.abs(
            cachedLayout.aspect -
            aspect,
          ) >
            0.0001
        ) {
          layout =
            createScreenCoilLayout(
              count,
              aspect,
              camera.fov,
            )

          screenCoilLayoutCacheRef.current = {
            imageCount:
              count,

            aspect,

            layout,
          }
        } else {
          layout =
            cachedLayout.layout
        }

        const slotCount =
          layout.slotCount

        if (
          slotCount <=
          0
        ) {
          renderer.render(
            scene,
            camera,
          )

          return
        }

        /*
         * The phase can keep increasing
         * forever; screenCoilPointAt wraps the
         * route automatically.
         */
        const phase =
          position

        for (
          let index = 0;
          index <
          slotsRef.current
            .length;
          index +=
          1
        ) {
          const slot =
            slotsRef.current[
              index
            ]

          if (
            index >=
            slotCount
          ) {
            slot.mesh.visible =
              false

            continue
          }

          slot.virtualIndex =
            index

          /*
           * If the nearest good rectangular
           * grid contains a few more cells than
           * unique wallpapers, repeat from the
           * beginning rather than showing empty
           * grid holes.
           */
          const imageIndex =
            positiveModulo(
              index,
              count,
            )

          if (
            slot.imageIndex !==
            imageIndex
          ) {
            assignSlotImage(
              slot,
              imageIndex,
            )
          }

          const logical =
            screenCoilPointAt(
              layout,

              index -
              phase,
            )

          const point =
            toThreeCoordinates(
              logical,
            )

          slot.mesh.position.set(
            point.x,
            point.y,
            point.z,
          )

          /*
           * All cards stay flat and parallel to
           * the monitor. They do NOT rotate to
           * face the path tangent.
           */
          slot.mesh.rotation.set(
            0,
            0,
            0,
          )

          slot.mesh.scale.set(
            layout.cardScale,
            layout.cardScale,
            1,
          )

          const brightness =
            brightnessAtPoint(
              logical,
              centerRef.current,
              minimumRef.current,
              softeningRef.current,
            )

          slot.material.color
            .setRGB(
              brightness,
              brightness,
              brightness,
            )

          advanceTextureFade(
            slot,
            delta,
          )

          /*
           * Every Screen Coil card remains
           * visible whenever its grid/path point
           * is within the camera frustum.
           */
          slot.material.opacity =
            slot.textureOpacity

          slot.mesh.frustumCulled =
            true

          slot.mesh.visible =
            true

          slot.mesh.renderOrder =
            index
        }
      } else if (
        closedLoopRef.current
      ) {
        const table =
          closedArcRef.current

        if (
          !table ||
          table.totalLength <=
            0
        ) {
          renderer.render(
            scene,
            camera,
          )

          return
        }

        const phase =
          positiveModulo(
            position,
            count,
          )

        const arcPerImage =
          table.totalLength /
          count

        for (
          let index = 0;
          index <
          slotsRef.current
            .length;
          index +=
          1
        ) {
          const slot =
            slotsRef.current[
              index
            ]

          if (
            index >=
            count
          ) {
            slot.mesh.visible =
              false

            continue
          }

          slot.virtualIndex =
            index

          if (
            slot.imageIndex !==
            index
          ) {
            assignSlotImage(
              slot,
              index,
            )
          }

          const arc =
            positiveModulo(
              (
                index -
                phase
              ) *
                arcPerImage,

              table.totalLength,
            )

          const t =
            tAtArcLength(
              table,
              arc,
            )

          try {
            const rawLogical =
              evaluateCompiledEquation(
                compiled,
                t,
              )

            const layout =
              closedLoopLayoutRef.current

            const logical =
              scaleClosedLoopPoint(
                rawLogical,
                layout.center,
                layout.scale,
              )

            const point =
              toThreeCoordinates(
                logical,
              )

            slot.mesh.scale.set(
              1,
              1,
              1,
            )

            slot.mesh.scale.set(
              1,
              1,
              1,
            )

            slot.mesh.position.set(
              point.x,
              point.y,
              point.z,
            )

            if (cardOrientationRef.current === 'camera') {
              slot.mesh.quaternion.copy(
                faceCameraQuaternion(
                  slot.mesh.position,
                  camera,
                ),
              )
            } else {
              slot.mesh.rotation.set(0, 0, 0)
            }

            const brightness =
              brightnessAtPoint(
                logical,
                centerRef.current,
                minimumRef.current,
                softeningRef.current,
              )

            slot.material.color
              .setRGB(
                brightness,
                brightness,
                brightness,
              )

            advanceTextureFade(
              slot,
              delta,
            )

            slot.material.opacity =
              slot.textureOpacity

            /*
             * Keep the mesh alive so Three.js
             * itself can frustum-cull it.
             * A missing texture remains
             * transparent rather than suddenly
             * producing a blank card.
             */
            slot.mesh.visible =
              true

            slot.mesh.frustumCulled =
              true
          } catch {
            slot.mesh.visible =
              false
          }
        }

        applyCardLayout(slotsRef.current, 1)

      } else {
        /*
         * ----------------------------------------------------
         * OPEN PATH
         *
         * Relative slot -> physical arc
         * distance -> t.
         *
         * Therefore every neighbouring card
         * is the same measured distance apart
         * along the curve. The spacing is chosen
         * once for this equation and viewport;
         * it must not be corrected per frame while
         * scrolling because that causes visible jumps.
         * ----------------------------------------------------
         */

        const table =
          openArcRef.current

        if (
          !table
        ) {
          renderer.render(
            scene,
            camera,
          )

          return
        }

        reconcileOpenSlots(
          position,
        )

        for (
          const slot
          of slotsRef.current
        ) {
          if (
            !slot.mesh.visible ||
            slot.virtualIndex ===
              null
          ) {
            continue
          }

          const relative =
            slot.virtualIndex -
            position

          const arcDistance =
            relative *
            openSpacing

          const t =
            tAtSignedArcDistance(
              table,
              arcDistance,
            )

          try {
            const logical =
              evaluateCompiledEquation(
                compiled,
                t,
              )

            const point =
              toThreeCoordinates(
                logical,
              )

            if (
              !Number.isFinite(
                point.x,
              ) ||
              !Number.isFinite(
                point.y,
              ) ||
              !Number.isFinite(
                point.z,
              )
            ) {
              slot.mesh.visible =
                false

              continue
            }

            slot.mesh.position.set(
              point.x,
              point.y,
              point.z,
            )

            if (cardOrientationRef.current === 'camera') {
              slot.mesh.quaternion.copy(
                faceCameraQuaternion(
                  slot.mesh.position,
                  camera,
                ),
              )
            } else {
              slot.mesh.rotation.set(0, 0, 0)
            }

            const brightness =
              brightnessAtPoint(
                logical,
                centerRef.current,
                minimumRef.current,
                softeningRef.current,
              )

            slot.material.color
              .setRGB(
                brightness,
                brightness,
                brightness,
              )

            const distance =
              Math.abs(
                relative,
              )

            const fade =
              clamp(
                fadeRef.current /
                  100,
                0,
                1,
              )

            advanceTextureFade(
              slot,
              delta,
            )

            const distanceOpacity =
              Math.max(
                0.08,
                1 -
                  fade *
                    clamp(
                      distance /
                        5,
                      0,
                      1,
                    ),
              )

            slot.material.opacity =
              distanceOpacity *
              slot.textureOpacity

            slot.mesh.frustumCulled =
              true
          } catch {
            slot.mesh.visible =
              false
          }
        }

        applyCardLayout(slotsRef.current, 1)

      }

      renderer.render(
        scene,
        camera,
      )
    }

    animate()

    return () => {
      destroyedRef.current =
        true

      stopped =
        true

      cancelAnimationFrame(
        frame,
      )

      resizeObserver.disconnect()

      container.removeEventListener(
        'wheel',
        handleWheel,
      )

      renderer.domElement.removeEventListener(
        'pointerdown',
        handleWallpaperPointerDown,
      )

      renderer.domElement.removeEventListener(
        'pointerup',
        handleWallpaperPointerUp,
      )

      geometry.dispose()

      renderer.dispose()

      timer.dispose()

      renderer.forceContextLoss()

      if (
        renderer.domElement
          .parentNode ===
        container
      ) {
        container.removeChild(
          renderer.domElement,
        )
      }

      sceneRef.current =
        null

      geometryRef.current =
        null
    }
  }, [
    positionRef,
    onViewAspectChange,
  ])

  /*
   * ==========================================================
   * MESH POOL
   * ==========================================================
   */

  useEffect(() => {
    const scene =
      sceneRef.current

    const geometry =
      geometryRef.current

    if (
      !scene ||
      !geometry
    ) {
      return
    }

    for (
      const slot
      of slotsRef.current
    ) {
      scene.remove(
        slot.mesh,
      )

      slot.material.dispose()
    }

    const count =
      items.length

    let poolSize =
      0

    if (
      count >
      0
    ) {
      if (
        screenCoil
      ) {
        poolSize =
          screenCoilSlotCount(
            count,
          )
      } else if (
        closedLoop
      ) {
        poolSize =
          count
      } else if (
        infiniteScroll
      ) {
        poolSize =
          LINEAR_POOL_SIZE
      } else {
        poolSize =
          Math.min(
            count,
            LINEAR_POOL_SIZE,
          )
      }
    }

    const slots:
      RenderSlot[] =
      []

    for (
      let index = 0;
      index <
      poolSize;
      index +=
      1
    ) {
      const material =
        new THREE.MeshBasicMaterial({
          color:
            0xffffff,

          transparent:
            true,

          opacity:
            1,

          side:
            THREE.DoubleSide,

          toneMapped:
            false,

          polygonOffset:
            true,

          polygonOffsetFactor:
            index *
            0.002,

          polygonOffsetUnits:
            index *
            0.002,
        })

      const mesh =
        new THREE.Mesh(
          geometry,
          material,
        )

      mesh.visible =
        false

      mesh.frustumCulled =
        true

      scene.add(
        mesh,
      )

      slots.push({
        mesh,
        material,

        virtualIndex:
          null,

        imageIndex:
          null,

        textureOpacity:
          0,

      })
    }

    slotsRef.current =
      slots

    smoothPositionRef.current =
      positionRef.current ??
      0

    return () => {
      for (
        const slot
        of slots
      ) {
        scene.remove(
          slot.mesh,
        )

        slot.material.dispose()
      }

      if (
        slotsRef.current ===
        slots
      ) {
        slotsRef.current =
          []
      }
    }
  }, [
    itemsKey,
    infiniteScroll,
    closedLoop,
    screenCoil,
    positionRef,
  ])

  useEffect(() => {
    return () => {
      for (
        const entry
        of texturesRef.current
          .values()
      ) {
        entry.texture.dispose()
      }

      texturesRef.current.clear()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="carousel"
    >
    </div>
  )
}
