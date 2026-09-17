import {
  useEffect,
  useRef,
} from 'react'

import type {
  RefObject,
} from 'react'

import * as THREE from 'three'

import {
  CAROUSEL_CAMERA_FOV,
  DEFAULT_CAROUSEL_VIEW_ASPECT,
  getCarouselViewSize,
} from './carouselView'

import {
  OrbitControls,
} from 'three/examples/jsm/controls/OrbitControls.js'

import {
  buildArcLengthTable,
  buildOpenArcLengthTable,
  compileParametricEquation,
  evaluateCompiledEquation,
  fromThreeCoordinates,
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

type AxisName =
  | 'x'
  | 'y'
  | 'z'

interface EquationGraphProps {
  equation:
    ParametricEquation

  imageCount?: number

  /*
   * Aspect ratio reported by the actual
   * Carousel renderer.
   */
  viewAspect?:
    number

  /*
   * Kept for compatibility.
   *
   * Graph layout intentionally does NOT
   * follow infinite carousel recycling.
   */
  positionRef?:
    RefObject<number>

  centerPoint?: Point3

  onCenterPointChange?: (
    point:
      Point3,
  ) => void

  infiniteScroll?:
    boolean

  closedLoop?:
    boolean

  showCurve?:
    boolean

  showPlane?:
    boolean

  showGrid?:
    boolean

  lineColor?:
    string

  lineWidth?:
    number
}

interface LabelResource {
  sprite:
    THREE.Sprite

  material:
    THREE.SpriteMaterial

  texture:
    THREE.CanvasTexture
}

const CAMERA_SPEED =
  5

const FAST_CAMERA_MULTIPLIER =
  3

function roundCoordinate(
  value: number,
) {
  return (
    Math.round(
      value *
      1000,
    ) /
    1000
  )
}

function createAxisLabel(
  text: string,
  color: string,
): LabelResource {
  const canvas =
    document.createElement(
      'canvas',
    )

  canvas.width =
    128

  canvas.height =
    128

  const context =
    canvas.getContext(
      '2d',
    )

  if (
    context
  ) {
    context.clearRect(
      0,
      0,
      128,
      128,
    )

    context.font =
      'bold 62px sans-serif'

    context.textAlign =
      'center'

    context.textBaseline =
      'middle'

    context.lineWidth =
      10

    context.strokeStyle =
      '#111318'

    context.fillStyle =
      color

    context.strokeText(
      text,
      64,
      65,
    )

    context.fillText(
      text,
      64,
      65,
    )
  }

  const texture =
    new THREE.CanvasTexture(
      canvas,
    )

  texture.colorSpace =
    THREE.SRGBColorSpace

  const material =
    new THREE.SpriteMaterial({
      map:
        texture,

      transparent:
        true,

      depthTest:
        false,

      depthWrite:
        false,
    })

  const sprite =
    new THREE.Sprite(
      material,
    )

  sprite.scale.set(
    0.42,
    0.42,
    0.42,
  )

  sprite.renderOrder =
    3001

  return {
    sprite,
    material,
    texture,
  }
}

export function EquationGraph({
  equation,
  imageCount = 0,
  viewAspect =
    DEFAULT_CAROUSEL_VIEW_ASPECT,
  centerPoint = {
    x: 0,
    y: 0,
    z: 0,
  },
  onCenterPointChange,
  closedLoop = false,
  showCurve = true,
  showPlane = true,
  showGrid = true,
  lineColor = '#ffffff',
  lineWidth = 2,
}: EquationGraphProps) {
  const containerRef =
    useRef<HTMLDivElement>(
      null,
    )

  const compiledRef =
    useRef<
      CompiledParametricEquation | null
    >(null)

  const arcTableRef =
    useRef<
      ArcLengthTable | null
    >(null)

  const curveRef =
    useRef<
      THREE.Line | null
    >(null)

  const curveMaterialRef =
    useRef<
      THREE.LineBasicMaterial | null
    >(null)

  const planeRef =
    useRef<
      THREE.Mesh | null
    >(null)

  const borderRef =
    useRef<
      THREE.LineSegments | null
    >(null)

  const gridRef =
    useRef<
      THREE.GridHelper | null
    >(null)

  const axesRef =
    useRef<
      THREE.AxesHelper | null
    >(null)

  const imagePointsRef =
    useRef<
      THREE.Points | null
    >(null)

  const centerMarkerRef =
    useRef<
      THREE.Mesh | null
    >(null)

  const centerPointRef =
    useRef(
      centerPoint,
    )

  const onCenterChangeRef =
    useRef(
      onCenterPointChange,
    )

  const draggingRef =
    useRef(
      false,
    )

  centerPointRef.current =
    centerPoint

  onCenterChangeRef.current =
    onCenterPointChange

  /*
   * ==========================================================
   * SCENE
   * ==========================================================
   */

  useEffect(() => {
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
      new THREE.Color(
        0x111318,
      )

    const camera =
      new THREE.PerspectiveCamera(
        CAROUSEL_CAMERA_FOV,
        1,
        0.1,
        2000,
      )

    camera.position.set(
      10,
      7,
      12,
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
          false,

        powerPreference:
          'low-power',
      })

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2,
      ),
    )

    renderer.outputColorSpace =
      THREE.SRGBColorSpace

    /*
     * The graph receives WASD only while
     * focused.
     *
     * Click the graph once, then use WASD.
     * This prevents typing "w" in an equation
     * input from moving the camera.
     */
    renderer.domElement.tabIndex =
      0

    renderer.domElement.style.outline =
      'none'

    renderer.domElement.setAttribute(
      'aria-label',
      '3D equation graph. Click to focus, then use W A S D to move the camera.',
    )

    container.appendChild(
      renderer.domElement,
    )

    const controls =
      new OrbitControls(
        camera,
        renderer.domElement,
      )

    controls.enableDamping =
      true

    controls.dampingFactor =
      0.08

    controls.enablePan =
      true

    controls.enableZoom =
      true

    controls.target.set(
      0,
      0,
      0,
    )

    controls.mouseButtons = {
      LEFT:
        THREE.MOUSE.ROTATE,

      MIDDLE:
        THREE.MOUSE.DOLLY,

      RIGHT:
        THREE.MOUSE.PAN,
    }

    /*
     * ========================================================
     * CURVE
     * ========================================================
     */

    const curveMaterial =
      new THREE.LineBasicMaterial({
        color:
          lineColor,

        linewidth:
          lineWidth,
      })

    const curve =
      new THREE.Line(
        new THREE.BufferGeometry(),
        curveMaterial,
      )

    scene.add(
      curve,
    )

    curveRef.current =
      curve

    curveMaterialRef.current =
      curveMaterial

    /*
     * ========================================================
     * VIEWING PLANE
     * ========================================================
     */

    const planeGeometry =
      new THREE.PlaneGeometry(
        1,
        1,
      )

    const planeMaterial =
      new THREE.MeshBasicMaterial({
        color:
          0xffffff,

        transparent:
          true,

        opacity:
          0.04,

        side:
          THREE.DoubleSide,

        depthWrite:
          false,
      })

    const plane =
      new THREE.Mesh(
        planeGeometry,
        planeMaterial,
      )

    scene.add(
      plane,
    )

    planeRef.current =
      plane

    const borderGeometry =
      new THREE.EdgesGeometry(
        planeGeometry,
      )

    const borderMaterial =
      new THREE.LineBasicMaterial({
        color:
          0x8d939d,

        transparent:
          true,

        opacity:
          0.6,
      })

    const border =
      new THREE.LineSegments(
        borderGeometry,
        borderMaterial,
      )

    scene.add(
      border,
    )

    borderRef.current =
      border

    /*
     * ========================================================
     * GRID
     * ========================================================
     */

    const grid =
      new THREE.GridHelper(
        40,
        40,
        0x5d626b,
        0x2d3138,
      )

    scene.add(
      grid,
    )

    gridRef.current =
      grid

    const axes =
      new THREE.AxesHelper(
        6,
      )

    scene.add(
      axes,
    )

    axesRef.current =
      axes

    /*
     * ========================================================
     * WALLPAPER POINTS
     *
     * These represent equal-arc-length
     * wallpaper locations.
     *
     * They remain independent from infinite
     * carousel mesh recycling.
     * ========================================================
     */

    const pointMaterial =
      new THREE.PointsMaterial({
        color:
          0xffffff,

        size:
          0.18,

        sizeAttenuation:
          true,
      })

    const imagePoints =
      new THREE.Points(
        new THREE.BufferGeometry(),
        pointMaterial,
      )

    scene.add(
      imagePoints,
    )

    imagePointsRef.current =
      imagePoints

    /*
     * ========================================================
     * LIGHT SOURCE
     * ========================================================
     */

    const centerGeometry =
      new THREE.SphereGeometry(
        0.3,
        24,
        18,
      )

    const centerMaterial =
      new THREE.MeshBasicMaterial({
        color:
          0xffd166,

        depthTest:
          false,

        depthWrite:
          false,
      })

    const centerMarker =
      new THREE.Mesh(
        centerGeometry,
        centerMaterial,
      )

    centerMarker.renderOrder =
      3000

    const initial =
      toThreeCoordinates(
        centerPointRef.current,
      )

    centerMarker.position.set(
      initial.x,
      initial.y,
      initial.z,
    )

    scene.add(
      centerMarker,
    )

    centerMarkerRef.current =
      centerMarker

    /*
     * A camera-facing glow makes the actual light origin easy
     * to find even when the graph is zoomed out or visually
     * busy. The glow is kept separate from the gizmo so scaling
     * it cannot change the drag handles.
     */
    const haloCanvas =
      document.createElement(
        'canvas',
      )

    haloCanvas.width =
      128

    haloCanvas.height =
      128

    const haloContext =
      haloCanvas.getContext(
        '2d',
      )

    if (
      haloContext
    ) {
      const gradient =
        haloContext.createRadialGradient(
          64,
          64,
          4,
          64,
          64,
          60,
        )

      gradient.addColorStop(
        0,
        'rgba(255, 255, 235, 1)',
      )

      gradient.addColorStop(
        0.18,
        'rgba(255, 209, 102, 0.95)',
      )

      gradient.addColorStop(
        0.48,
        'rgba(255, 209, 102, 0.32)',
      )

      gradient.addColorStop(
        1,
        'rgba(255, 209, 102, 0)',
      )

      haloContext.fillStyle =
        gradient

      haloContext.fillRect(
        0,
        0,
        128,
        128,
      )
    }

    const haloTexture =
      new THREE.CanvasTexture(
        haloCanvas,
      )

    haloTexture.colorSpace =
      THREE.SRGBColorSpace

    const haloMaterial =
      new THREE.SpriteMaterial({
        map:
          haloTexture,

        transparent:
          true,

        depthTest:
          false,

        depthWrite:
          false,

        blending:
          THREE.AdditiveBlending,
      })

    const lightHalo =
      new THREE.Sprite(
        haloMaterial,
      )

    lightHalo.renderOrder =
      2999

    scene.add(
      lightHalo,
    )

    /*
     * ========================================================
     * SIX-SIDED XYZ MOVE GIZMO
     *
     *          +Z
     *           ↑
     *           |
     *   -X ← light → +X
     *           |
     *           ↓
     *          -Z
     *
     * Y points through depth and gets
     * equivalent +Y and -Y arrows.
     *
     * Equation:
     *   X -> Three X
     *   Y -> Three Z
     *   Z -> Three Y
     * ========================================================
     */

    const gizmo =
      new THREE.Group()

    centerMarker.add(
      gizmo,
    )

    const axisColors = {
      x:
        0xff4d4d,

      y:
        0x50e878,

      z:
        0x4d86ff,
    }

    const axisCss = {
      x:
        '#ff4d4d',

      y:
        '#50e878',

      z:
        '#4d86ff',
    }

    const axisMaterials: Record<
      AxisName,
      THREE.MeshBasicMaterial
    > = {
      x:
        new THREE.MeshBasicMaterial({
          color:
            axisColors.x,

          transparent:
            true,

          depthTest:
            false,

          depthWrite:
            false,
        }),

      y:
        new THREE.MeshBasicMaterial({
          color:
            axisColors.y,

          transparent:
            true,

          depthTest:
            false,

          depthWrite:
            false,
        }),

      z:
        new THREE.MeshBasicMaterial({
          color:
            axisColors.z,

          transparent:
            true,

          depthTest:
            false,

          depthWrite:
            false,
        }),
    }

    const hitMaterial =
      new THREE.MeshBasicMaterial({
        transparent:
          true,

        opacity:
          0,

        depthTest:
          false,

        depthWrite:
          false,
      })

    const clickable:
      THREE.Mesh[] =
      []

    const gizmoGeometries:
      THREE.BufferGeometry[] =
      []

    const labels:
      LabelResource[] =
      []

    const SHAFT_START =
      0.28

    const SHAFT_LENGTH =
      0.92

    const CONE_LENGTH =
      0.28

    const CONE_RADIUS =
      0.14

    function worldAxis(
      axis:
        AxisName,
    ) {
      switch (
        axis
      ) {
        case 'x':
          return new THREE.Vector3(
            1,
            0,
            0,
          )

        case 'y':
          return new THREE.Vector3(
            0,
            0,
            1,
          )

        case 'z':
          return new THREE.Vector3(
            0,
            1,
            0,
          )
      }
    }

    function addArrow(
      axis:
        AxisName,
      sign:
        1 | -1,
    ) {
      const direction =
        worldAxis(
          axis,
        )
          .multiplyScalar(
            sign,
          )

      const rotation =
        new THREE.Quaternion()
          .setFromUnitVectors(
            new THREE.Vector3(
              0,
              1,
              0,
            ),
            direction,
          )

      const shaftGeometry =
        new THREE.CylinderGeometry(
          0.047,
          0.047,
          SHAFT_LENGTH,
          10,
        )

      gizmoGeometries.push(
        shaftGeometry,
      )

      const shaft =
        new THREE.Mesh(
          shaftGeometry,
          axisMaterials[
            axis
          ],
        )

      shaft.quaternion.copy(
        rotation,
      )

      shaft.position.copy(
        direction
          .clone()
          .multiplyScalar(
            SHAFT_START +
            SHAFT_LENGTH /
              2,
          ),
      )

      shaft.renderOrder =
        3001

      gizmo.add(
        shaft,
      )

      const coneGeometry =
        new THREE.ConeGeometry(
          CONE_RADIUS,
          CONE_LENGTH,
          12,
        )

      gizmoGeometries.push(
        coneGeometry,
      )

      const cone =
        new THREE.Mesh(
          coneGeometry,
          axisMaterials[
            axis
          ],
        )

      cone.quaternion.copy(
        rotation,
      )

      cone.position.copy(
        direction
          .clone()
          .multiplyScalar(
            SHAFT_START +
            SHAFT_LENGTH +
            CONE_LENGTH /
              2,
          ),
      )

      cone.renderOrder =
        3001

      gizmo.add(
        cone,
      )

      /*
       * Larger invisible cylinder.
       *
       * This is deliberately much wider than
       * the visual arrow, making handles much
       * easier to select.
       */
      const hitGeometry =
        new THREE.CylinderGeometry(
          0.15,
          0.15,
          SHAFT_LENGTH +
            CONE_LENGTH +
            0.16,
          8,
        )

      gizmoGeometries.push(
        hitGeometry,
      )

      const hit =
        new THREE.Mesh(
          hitGeometry,
          hitMaterial,
        )

      hit.quaternion.copy(
        rotation,
      )

      hit.position.copy(
        direction
          .clone()
          .multiplyScalar(
            SHAFT_START +
            (
              SHAFT_LENGTH +
              CONE_LENGTH
            ) /
              2,
          ),
      )

      hit.userData.axis =
        axis

      hit.userData.sign =
        sign

      gizmo.add(
        hit,
      )

      clickable.push(
        hit,
      )

      const label =
        createAxisLabel(
          sign >
          0
            ? `+${axis.toUpperCase()}`
            : `-${axis.toUpperCase()}`,

          axisCss[
            axis
          ],
        )

      label.sprite.position.copy(
        direction
          .clone()
          .multiplyScalar(
            SHAFT_START +
            SHAFT_LENGTH +
            CONE_LENGTH +
            0.3,
          ),
      )

      gizmo.add(
        label.sprite,
      )

      labels.push(
        label,
      )
    }

    addArrow(
      'x',
      1,
    )

    addArrow(
      'x',
      -1,
    )

    addArrow(
      'y',
      1,
    )

    addArrow(
      'y',
      -1,
    )

    addArrow(
      'z',
      1,
    )

    addArrow(
      'z',
      -1,
    )

    /*
     * ========================================================
     * GIZMO DRAGGING
     * ========================================================
     */

    const raycaster =
      new THREE.Raycaster()

    const pointer =
      new THREE.Vector2()

    const dragPlane =
      new THREE.Plane()

    const dragHit =
      new THREE.Vector3()

    const dragStartHit =
      new THREE.Vector3()

    const dragStartPosition =
      new THREE.Vector3()

    const selectedAxisVector =
      new THREE.Vector3()

    const cameraDirection =
      new THREE.Vector3()

    const side =
      new THREE.Vector3()

    const planeNormal =
      new THREE.Vector3()

    let selectedAxis:
      AxisName | null =
      null

    let activePointer:
      number | null =
      null

    function updatePointer(
      event:
        PointerEvent,
    ) {
      const rect =
        renderer.domElement
          .getBoundingClientRect()

      if (
        rect.width <=
          0 ||
        rect.height <=
          0
      ) {
        return false
      }

      pointer.x =
        (
          (
            event.clientX -
            rect.left
          ) /
          rect.width
        ) *
          2 -
        1

      pointer.y =
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
        pointer,
        camera,
      )

      return true
    }

    function highlightAxis(
      axis:
        AxisName | null,
    ) {
      for (
        const name
        of [
          'x',
          'y',
          'z',
        ] as AxisName[]
      ) {
        const material =
          axisMaterials[
            name
          ]

        material.opacity =
          axis ===
          null ||
          axis ===
          name
            ? 1
            : 0.25

        material.needsUpdate =
          true
      }
    }

    function publishCenter() {
      const logical =
        fromThreeCoordinates(
          centerMarker.position,
        )

      const value:
        Point3 = {
        x:
          roundCoordinate(
            logical.x,
          ),

        y:
          roundCoordinate(
            logical.y,
          ),

        z:
          roundCoordinate(
            logical.z,
          ),
      }

      centerPointRef.current =
        value

      onCenterChangeRef.current?.(
        value,
      )
    }

    function pointerDown(
      event:
        PointerEvent,
    ) {
      /*
       * Clicking anywhere in the graph focuses
       * it for WASD.
       */
      renderer.domElement.focus({
        preventScroll:
          true,
      })

      if (
        event.button !==
        0
      ) {
        return
      }

      if (
        !updatePointer(
          event,
        )
      ) {
        return
      }

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

      const axis =
        hits[0]
          .object
          .userData
          .axis as
          | AxisName
          | undefined

      if (
        !axis
      ) {
        return
      }

      event.preventDefault()

      event.stopImmediatePropagation()

      selectedAxis =
        axis

      activePointer =
        event.pointerId

      draggingRef.current =
        true

      controls.enabled =
        false

      renderer.domElement.style.cursor =
        'grabbing'

      highlightAxis(
        axis,
      )

      selectedAxisVector.copy(
        worldAxis(
          axis,
        ),
      )

      dragStartPosition.copy(
        centerMarker.position,
      )

      /*
       * Construct a plane containing the
       * selected axis while facing the camera
       * as much as possible.
       *
       * Pointer motion on this plane is then
       * projected onto the selected axis.
       */
      cameraDirection
        .copy(
          camera.position,
        )
        .sub(
          centerMarker.position,
        )
        .normalize()

      side.crossVectors(
        selectedAxisVector,
        cameraDirection,
      )

      if (
        side.lengthSq() <
        0.000001
      ) {
        side.crossVectors(
          selectedAxisVector,
          camera.up,
        )
      }

      side.normalize()

      planeNormal
        .crossVectors(
          side,
          selectedAxisVector,
        )
        .normalize()

      dragPlane.setFromNormalAndCoplanarPoint(
        planeNormal,
        centerMarker.position,
      )

      if (
        !raycaster.ray
          .intersectPlane(
            dragPlane,
            dragStartHit,
          )
      ) {
        selectedAxis =
          null

        draggingRef.current =
          false

        controls.enabled =
          true

        return
      }

      try {
        renderer.domElement
          .setPointerCapture(
            event.pointerId,
          )
      } catch {
        // optional
      }
    }

    function pointerMove(
      event:
        PointerEvent,
    ) {
      if (
        !updatePointer(
          event,
        )
      ) {
        return
      }

      if (
        !selectedAxis
      ) {
        const hits =
          raycaster.intersectObjects(
            clickable,
            false,
          )

        if (
          hits.length >
          0
        ) {
          const axis =
            hits[0]
              .object
              .userData
              .axis as
              AxisName

          highlightAxis(
            axis,
          )

          renderer.domElement.style.cursor =
            'grab'
        } else {
          highlightAxis(
            null,
          )

          renderer.domElement.style.cursor =
            'default'
        }

        return
      }

      if (
        activePointer !==
        event.pointerId
      ) {
        return
      }

      event.preventDefault()

      event.stopImmediatePropagation()

      if (
        !raycaster.ray
          .intersectPlane(
            dragPlane,
            dragHit,
          )
      ) {
        return
      }

      const amount =
        dragHit
          .clone()
          .sub(
            dragStartHit,
          )
          .dot(
            selectedAxisVector,
          )

      centerMarker.position
        .copy(
          dragStartPosition,
        )
        .addScaledVector(
          selectedAxisVector,
          amount,
        )

      publishCenter()
    }

    function pointerUp(
      event:
        PointerEvent,
    ) {
      if (
        !selectedAxis ||
        activePointer !==
          event.pointerId
      ) {
        return
      }

      event.preventDefault()

      event.stopImmediatePropagation()

      selectedAxis =
        null

      activePointer =
        null

      draggingRef.current =
        false

      controls.enabled =
        true

      highlightAxis(
        null,
      )

      renderer.domElement.style.cursor =
        'default'

      try {
        renderer.domElement
          .releasePointerCapture(
            event.pointerId,
          )
      } catch {
        // optional
      }

      publishCenter()
    }

    renderer.domElement.addEventListener(
      'pointerdown',
      pointerDown,
      true,
    )

    renderer.domElement.addEventListener(
      'pointermove',
      pointerMove,
      true,
    )

    renderer.domElement.addEventListener(
      'pointerup',
      pointerUp,
      true,
    )

    renderer.domElement.addEventListener(
      'pointercancel',
      pointerUp,
      true,
    )

    /*
     * ========================================================
     * WASD CAMERA
     * ========================================================
     *
     * W = forward
     * S = backward
     * A = left
     * D = right
     *
     * Shift = faster movement.
     *
     * Both camera and OrbitControls target
     * move together, producing FPS/Roblox-like
     * navigation without breaking mouse orbit.
     * ========================================================
     */

    const keys =
      new Set<string>()

    function keyDown(
      event:
        KeyboardEvent,
    ) {
      const key =
        event.key.toLowerCase()

      if (
        key ===
          'w' ||
        key ===
          'a' ||
        key ===
          's' ||
        key ===
          'd' ||
        key ===
          'shift'
      ) {
        keys.add(
          key,
        )

        if (
          key !==
          'shift'
        ) {
          event.preventDefault()
        }
      }
    }

    function keyUp(
      event:
        KeyboardEvent,
    ) {
      keys.delete(
        event.key.toLowerCase(),
      )
    }

    function blur() {
      keys.clear()
    }

    renderer.domElement.addEventListener(
      'keydown',
      keyDown,
    )

    renderer.domElement.addEventListener(
      'keyup',
      keyUp,
    )

    renderer.domElement.addEventListener(
      'blur',
      blur,
    )

    const forward =
      new THREE.Vector3()

    const right =
      new THREE.Vector3()

    const movement =
      new THREE.Vector3()

    function updateKeyboardCamera(
      delta:
        number,
    ) {
      if (
        keys.size ===
        0
      ) {
        return
      }

      camera.getWorldDirection(
        forward,
      )

      forward.normalize()

      right
        .crossVectors(
          forward,
          camera.up,
        )
        .normalize()

      movement.set(
        0,
        0,
        0,
      )

      if (
        keys.has(
          'w',
        )
      ) {
        movement.add(
          forward,
        )
      }

      if (
        keys.has(
          's',
        )
      ) {
        movement.sub(
          forward,
        )
      }

      if (
        keys.has(
          'd',
        )
      ) {
        movement.add(
          right,
        )
      }

      if (
        keys.has(
          'a',
        )
      ) {
        movement.sub(
          right,
        )
      }

      if (
        movement.lengthSq() <=
        0
      ) {
        return
      }

      const speed =
        CAMERA_SPEED *
        (
          keys.has(
            'shift',
          )
            ? FAST_CAMERA_MULTIPLIER
            : 1
        )

      movement
        .normalize()
        .multiplyScalar(
          speed *
          delta,
        )

      camera.position.add(
        movement,
      )

      controls.target.add(
        movement,
      )
    }

    /*
     * ========================================================
     * RESIZE
     * ========================================================
     */

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

      camera.aspect =
        width /
        height

      camera.updateProjectionMatrix()

      renderer.setSize(
        width,
        height,
        false,
      )
    }

    const observer =
      new ResizeObserver(
        resize,
      )

    observer.observe(
      container,
    )

    requestAnimationFrame(
      resize,
    )

    /*
     * ========================================================
     * ANIMATION
     * ========================================================
     */

    const timer =
      new THREE.Timer()

    timer.connect(document)

    const lightWorld =
      new THREE.Vector3()

    let frame =
      0

    let stopped =
      false

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

      updateKeyboardCamera(
        delta,
      )

      controls.update()

      /*
       * Keep gizmo approximately the same
       * screen size at different zoom levels.
       */
      centerMarker.getWorldPosition(
        lightWorld,
      )

      const distance =
        camera.position.distanceTo(
          lightWorld,
        )

      const scale =
        THREE.MathUtils.clamp(
          distance *
            0.075,
          0.55,
          2.5,
        )

      lightHalo.position.copy(
        lightWorld,
      )

      const haloScale =
        THREE.MathUtils.clamp(
          distance *
            0.11,
          1.4,
          4.5,
        )

      lightHalo.scale.set(
        haloScale,
        haloScale,
        1,
      )

      gizmo.scale.setScalar(
        scale,
      )

      renderer.render(
        scene,
        camera,
      )
    }

    animate()

    return () => {
      stopped =
        true

      cancelAnimationFrame(
        frame,
      )

      observer.disconnect()

      renderer.domElement.removeEventListener(
        'pointerdown',
        pointerDown,
        true,
      )

      renderer.domElement.removeEventListener(
        'pointermove',
        pointerMove,
        true,
      )

      renderer.domElement.removeEventListener(
        'pointerup',
        pointerUp,
        true,
      )

      renderer.domElement.removeEventListener(
        'pointercancel',
        pointerUp,
        true,
      )

      renderer.domElement.removeEventListener(
        'keydown',
        keyDown,
      )

      renderer.domElement.removeEventListener(
        'keyup',
        keyUp,
      )

      renderer.domElement.removeEventListener(
        'blur',
        blur,
      )

      controls.dispose()

      curve.geometry.dispose()

      curveMaterial.dispose()

      planeGeometry.dispose()

      planeMaterial.dispose()

      borderGeometry.dispose()

      borderMaterial.dispose()

      grid.geometry.dispose()

      if (
        Array.isArray(
          grid.material,
        )
      ) {
        for (
          const material
          of grid.material
        ) {
          material.dispose()
        }
      } else {
        grid.material.dispose()
      }

      axes.geometry.dispose()

      if (
        Array.isArray(
          axes.material,
        )
      ) {
        for (
          const material
          of axes.material
        ) {
          material.dispose()
        }
      } else {
        axes.material.dispose()
      }

      imagePoints.geometry.dispose()

      pointMaterial.dispose()

      scene.remove(
        lightHalo,
      )

      haloTexture.dispose()

      haloMaterial.dispose()

      centerGeometry.dispose()

      centerMaterial.dispose()

      for (
        const geometry
        of gizmoGeometries
      ) {
        geometry.dispose()
      }

      axisMaterials.x.dispose()
      axisMaterials.y.dispose()
      axisMaterials.z.dispose()

      hitMaterial.dispose()

      for (
        const label
        of labels
      ) {
        label.texture.dispose()
        label.material.dispose()
      }

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

      curveRef.current =
        null

      planeRef.current =
        null

      borderRef.current =
        null

      gridRef.current =
        null

      axesRef.current =
        null

      imagePointsRef.current =
        null

      centerMarkerRef.current =
        null
    }
  }, [])

  /*
   * ==========================================================
   * ACTUAL CAROUSEL VIEWPORT
   * ==========================================================
   *
   * The plane is not an arbitrary graph decoration.
   * It represents the exact world-space rectangle
   * visible through the real Carousel camera at
   * logical Y = 0.
   */
  useEffect(() => {
    const plane =
      planeRef.current

    const border =
      borderRef.current

    if (
      !plane ||
      !border
    ) {
      return
    }

    const {
      width,
      height,
    } =
      getCarouselViewSize(
        viewAspect,
      )

    plane.scale.set(
      width,
      height,
      1,
    )

    border.scale.set(
      width,
      height,
      1,
    )
  }, [
    viewAspect,
  ])

  /*
   * ==========================================================
   * EQUATION + ARC LENGTH + GRAPH POINTS
   * ==========================================================
   */

  useEffect(() => {
    const curve =
      curveRef.current

    const imagePoints =
      imagePointsRef.current

    if (
      !curve ||
      !imagePoints
    ) {
      return
    }

    try {
      const compiled =
        compileParametricEquation(
          equation,
        )

      compiledRef.current =
        compiled

      let table:
        ArcLengthTable

      if (
        closedLoop
      ) {
        /*
         * One complete period.
         */
        table =
          buildArcLengthTable(
            compiled,
            0,
            Math.PI *
              2,
            4096,
          )
      } else {
        /*
         * The graph itself can show every
         * wallpaper's base position.
         */
        const required =
          Math.max(
            30,
            (
              Math.max(
                1,
                imageCount -
                1,
              ) +
              2
            ) *
              WALLPAPER_SPACING,
          )

        table =
          buildOpenArcLengthTable(
            compiled,
            required,
          )
      }

      arcTableRef.current =
        table

      /*
       * ------------------------------------------------------
       * CURVE GEOMETRY
       * ------------------------------------------------------
       */

      const curvePoints:
        THREE.Vector3[] =
        []

      const maxGraphSamples =
        1400

      const stride =
        Math.max(
          1,
          Math.floor(
            table.ts.length /
            maxGraphSamples,
          ),
        )

      for (
        let index = 0;
        index <
        table.ts.length;
        index +=
        stride
      ) {
        try {
          const logical =
            evaluateCompiledEquation(
              compiled,
              table.ts[
                index
              ],
            )

          const point =
            toThreeCoordinates(
              logical,
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
            curvePoints.push(
              new THREE.Vector3(
                point.x,
                point.y,
                point.z,
              ),
            )
          }
        } catch {
          // Skip invalid sample.
        }
      }

      const oldCurve =
        curve.geometry

      curve.geometry =
        new THREE.BufferGeometry()
          .setFromPoints(
            curvePoints,
          )

      oldCurve.dispose()

      /*
       * ------------------------------------------------------
       * WALLPAPER LOCATION POINTS
       * ------------------------------------------------------
       */

      const positions =
        new Float32Array(
          imageCount *
          3,
        )

      for (
        let index = 0;
        index <
        imageCount;
        index +=
        1
      ) {
        let t =
          0

        if (
          closedLoop &&
          imageCount >
            0 &&
          table.totalLength >
            0
        ) {
          /*
           * Split ENTIRE loop arc length by N.
           */
          const arc =
            (
              index /
              imageCount
            ) *
            table.totalLength

          t =
            tAtArcLength(
              table,
              arc,
            )
        } else {
          /*
           * Fixed world-space arc distance
           * between neighbouring wallpapers.
           */
          t =
            tAtSignedArcDistance(
              table,
              index *
                WALLPAPER_SPACING,
            )
        }

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

          positions[
            index *
              3
          ] =
            point.x

          positions[
            index *
              3 +
            1
          ] =
            point.y

          positions[
            index *
              3 +
            2
          ] =
            point.z
        } catch {
          positions[
            index *
              3
          ] =
            100000

          positions[
            index *
              3 +
            1
          ] =
            100000

          positions[
            index *
              3 +
            2
          ] =
            100000
        }
      }

      const pointGeometry =
        new THREE.BufferGeometry()

      pointGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          positions,
          3,
        ),
      )

      const oldPoints =
        imagePoints.geometry

      imagePoints.geometry =
        pointGeometry

      oldPoints.dispose()

      imagePoints.visible =
        imageCount >
        0
    } catch (error) {
      console.warn(
        'Failed to build equation graph:',
        error,
      )

      compiledRef.current =
        null

      arcTableRef.current =
        null
    }
  }, [
    equation.x,
    equation.y,
    equation.z,
    imageCount,
    closedLoop,
  ])

  /*
   * ==========================================================
   * NUMERIC LIGHT POSITION -> GIZMO
   * ==========================================================
   */

  useEffect(() => {
    if (
      draggingRef.current
    ) {
      return
    }

    const marker =
      centerMarkerRef.current

    if (
      !marker
    ) {
      return
    }

    const point =
      toThreeCoordinates(
        centerPoint,
      )

    marker.position.set(
      point.x,
      point.y,
      point.z,
    )
  }, [
    centerPoint.x,
    centerPoint.y,
    centerPoint.z,
  ])

  /*
   * ==========================================================
   * VISUAL SETTINGS
   * ==========================================================
   */

  useEffect(() => {
    if (
      curveRef.current
    ) {
      curveRef.current.visible =
        showCurve
    }

    if (
      planeRef.current
    ) {
      planeRef.current.visible =
        showPlane
    }

    if (
      borderRef.current
    ) {
      borderRef.current.visible =
        showPlane
    }

    if (
      gridRef.current
    ) {
      gridRef.current.visible =
        showGrid
    }

    if (
      axesRef.current
    ) {
      axesRef.current.visible =
        showGrid
    }

    const material =
      curveMaterialRef.current

    if (
      material
    ) {
      material.color.set(
        lineColor,
      )

      material.linewidth =
        lineWidth

      material.needsUpdate =
        true
    }
  }, [
    showCurve,
    showPlane,
    showGrid,
    lineColor,
    lineWidth,
  ])

  return (
    <div
      ref={containerRef}
      className="equation-graph"
    />
  )
}
