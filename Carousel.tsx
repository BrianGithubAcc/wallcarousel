import {
  useEffect,
  useRef,
} from 'react'

import * as THREE from 'three'

import {
  convertFileSrc,
} from '@tauri-apps/api/core'

import {
  calculateCarouselTransform,
  createCarouselMathConfig,
} from './carousel.math'

import type {
  CarouselItem,
} from './carousel.types'

import './Carousel.css'

interface CarouselProps {
  items: CarouselItem[]
  positionRef: React.RefObject<number>
  equation?: string
  onScroll?: (amount: number) => void
}

function cropTexture(
  texture: THREE.Texture,
  imageWidth: number,
  imageHeight: number,
  targetAspect: number,
) {
  const imageAspect =
    imageWidth / imageHeight

  texture.center.set(
    0.5,
    0.5,
  )

  texture.repeat.set(
    1,
    1,
  )

  texture.offset.set(
    0,
    0,
  )

  if (imageAspect > targetAspect) {
    const visibleWidth =
      targetAspect / imageAspect

    texture.repeat.x =
      visibleWidth

    texture.offset.x =
      (1 - visibleWidth) / 2

  } else if (
    imageAspect < targetAspect
  ) {
    const visibleHeight =
      imageAspect / targetAspect

    texture.repeat.y =
      visibleHeight

    texture.offset.y =
      (1 - visibleHeight) / 2
  }
}

export function Carousel({
  items,
  positionRef,
  equation = '-0.04 * x^2',
  onScroll,
}: CarouselProps) {
  const containerRef =
    useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container =
      containerRef.current

    if (!container) {
      return
    }

    container.innerHTML = ''

    const scene =
      new THREE.Scene()

    const camera =
      new THREE.PerspectiveCamera(
        45,
        1,
        0.1,
        1000,
      )

    camera.position.set(
      0,
      0,
      18,
    )

    camera.lookAt(
      0,
      0,
      0,
    )

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference:
          'high-performance',
      })

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2,
      ),
    )

    renderer.setClearColor(
      0x111111,
      1,
    )

    container.appendChild(
      renderer.domElement,
    )

    const mathConfig =
      createCarouselMathConfig(
        equation,
        {
          spacing: 3.8,
          activeScale: 1,
          inactiveScale: 0.82,
          visibilityDistance: 3,
        },
      )

    const meshes:
      THREE.Mesh[] = []

    const textureLoader =
      new THREE.TextureLoader()

    for (
      let index = 0;
      index < items.length;
      index++
    ) {
      const item =
        items[index]

      const geometry =
        new THREE.PlaneGeometry(
          3.2,
          1.8,
        )

      const imageUrl =
        convertFileSrc(
          item.path,
        )

      const texture =
        textureLoader.load(
          imageUrl,
          (loadedTexture) => {
            const image =
              loadedTexture.image

            if (!image) {
              return
            }

            cropTexture(
              loadedTexture,
              image.width,
              image.height,
              16 / 9,
            )

            loadedTexture.needsUpdate =
              true
          },
        )

      texture.colorSpace =
        THREE.SRGBColorSpace

      texture.minFilter =
        THREE.LinearFilter

      texture.magFilter =
        THREE.LinearFilter

      const material =
        new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: true,
        })

      const mesh =
        new THREE.Mesh(
          geometry,
          material,
        )

      mesh.userData.index =
        index

      scene.add(mesh)

      meshes.push(mesh)
    }

    const WHEEL_SENSITIVITY =
      0.0015

    const handleWheel =
      (event: WheelEvent) => {
        event.preventDefault()

        const delta =
          Math.abs(event.deltaY) >=
          Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX

        if (
          Math.abs(delta) <
          0.01
        ) {
          return
        }

        onScroll?.(
          delta *
            WHEEL_SENSITIVITY,
        )
      }

    container.addEventListener(
      'wheel',
      handleWheel,
      {
        passive: false,
      },
    )

    const resize = () => {
      const width =
        container.clientWidth

      const height =
        container.clientHeight

      if (
        width <= 0 ||
        height <= 0
      ) {
        return
      }

      camera.aspect =
        width / height

      camera.updateProjectionMatrix()

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

    resize()

    let animationFrame = 0

    const animate = () => {
      animationFrame =
        requestAnimationFrame(
          animate,
        )

      const position =
        positionRef.current

      for (
        const mesh of meshes
      ) {
        const index =
          mesh.userData
            .index as number

        const transform =
          calculateCarouselTransform(
            index,
            position,
            mathConfig,
          )

        mesh.visible =
          transform.visible

        mesh.position.x =
          transform.x

        mesh.position.y =
          transform.y

        mesh.position.z =
          transform.z

        mesh.rotation.y =
          transform.rotationY

        mesh.scale.setScalar(
          transform.scale,
        )

        const material =
          mesh.material as
            THREE.MeshBasicMaterial

        material.opacity =
          transform.opacity

        material.color.setRGB(
          transform.brightness,
          transform.brightness,
          transform.brightness,
        )
      }

      renderer.render(
        scene,
        camera,
      )
    }

    animate()

    return () => {
      cancelAnimationFrame(
        animationFrame,
      )

      resizeObserver.disconnect()

      container.removeEventListener(
        'wheel',
        handleWheel,
      )

      for (
        const mesh of meshes
      ) {
        mesh.geometry.dispose()

        const material =
          mesh.material as
            THREE.MeshBasicMaterial

        material.map?.dispose()
        material.dispose()
      }

      renderer.dispose()

      if (
        renderer.domElement
          .parentNode ===
        container
      ) {
        container.removeChild(
          renderer.domElement,
        )
      }
    }
  }, [
    items,
    equation,
    positionRef,
    onScroll,
  ])

  return (
    <div
      ref={containerRef}
      className="carousel"
    />
  )
}
