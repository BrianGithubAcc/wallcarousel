export const CAROUSEL_CAMERA_FOV =
  42

export const CAROUSEL_CAMERA_DISTANCE =
  10

export const CAROUSEL_CAMERA_NEAR =
  0.1

export const CAROUSEL_CAMERA_FAR =
  1000

/*
 * Used until Carousel reports the exact
 * aspect ratio of its rendered viewport.
 */
export const DEFAULT_CAROUSEL_VIEW_ASPECT =
  16 / 9


export interface CarouselViewSize {
  width: number
  height: number
}


/*
 * Size of the perspective camera frustum
 * where it intersects the carousel's flat
 * X/Z plane.
 *
 * The carousel camera is perpendicular to
 * that plane and sits CAMERA_DISTANCE units
 * in front of it.
 */
export function getCarouselViewSize(
  aspect:
    number,
  cameraDistance =
    CAROUSEL_CAMERA_DISTANCE,
): CarouselViewSize {
  const safeAspect =
    Number.isFinite(
      aspect,
    ) &&
    aspect >
      0
      ? aspect
      : DEFAULT_CAROUSEL_VIEW_ASPECT

  const halfFovRadians =
    (
      CAROUSEL_CAMERA_FOV *
      Math.PI /
      180
    ) /
    2

  const height =
    2 *
    cameraDistance *
    Math.tan(
      halfFovRadians,
    )

  return {
    width:
      height *
      safeAspect,

    height,
  }
}
