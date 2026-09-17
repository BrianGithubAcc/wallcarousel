export interface CarouselItem {
  id: string
  label: string
  path: string
}

export interface CarouselTransform {
  x: number
  y: number
  z: number

  rotationY: number

  scale: number

  opacity: number

  brightness: number

  /**
   * 0 = completely inactive
   * 1 = currently centred
   */
  activeAmount: number

  /**
   * Whether the item is within the visible
   * portion of the carousel.
   */
  visible: boolean
}

export type CarouselCardOrientation = 'camera' | 'grid'
