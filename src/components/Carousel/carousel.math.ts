import { Equation } from '../../math/Equation'

import type {
  CarouselTransform,
} from './carousel.types'

export interface CarouselMathConfig {
  /**
   * Distance between carousel items along the X axis.
   */
  spacing: number

  /**
   * Equation describing the carousel surface/curve.
   *
   * Examples:
   *
   *   -0.05 * x^2
   *   -0.02 * abs(x)^3
   *   sin(x) * 2
   */
  equation: Equation

  /**
   * Amount of visual scaling applied to the
   * active/inactive items.
   */
  activeScale: number
  inactiveScale: number

  /**
   * Maximum distance from the centre at which
   * items remain visible.
   */
  visibilityDistance: number
}

const DEFAULT_CONFIG: CarouselMathConfig = {
  spacing: 4,
  equation: new Equation('-0.05 * x^2'),

  activeScale: 1,
  inactiveScale: 0.8,

  visibilityDistance: 4,
}

/**
 * Calculates how strongly an item is associated
 * with the centre of the carousel.
 *
 * 1 = exactly centred
 * 0 = outside the active range
 */
function calculateActiveAmount(
  relativePosition: number,
): number {
  const distance =
    Math.abs(relativePosition)

  return Math.max(
    0,
    1 - distance,
  )
}

/**
 * Converts a carousel item into a 3D transform.
 *
 * The equation determines Z:
 *
 *     z = f(x, y)
 *
 * At the moment y is always 0 because our carousel
 * is a one-dimensional row of wallpapers.
 *
 * This can later be extended to a true 2D surface.
 */
export function calculateCarouselTransform(
  index: number,
  carouselPosition: number,
  config: CarouselMathConfig = DEFAULT_CONFIG,
): CarouselTransform {
  const relativePosition =
    index - carouselPosition

  const x =
    relativePosition * config.spacing

  /*
   * The carousel currently lies along:
   *
   *     y = 0
   *
   * Therefore the user's equation receives:
   *
   *     x = horizontal position
   *     y = 0
   */
  const y = 0

  const z =
    config.equation.evaluateAt(
      x,
      y,
    )

  const activeAmount =
    calculateActiveAmount(
      relativePosition,
    )

  /*
   * The equation describes the position of the
   * wallpaper in 3D space.
   *
   * We also rotate the wallpaper so it follows
   * the slope of the curve.
   */
  const slope =
    calculateSlope(
      config.equation,
      x,
    )

  const rotationY =
    Math.atan(slope)

  const scale =
    config.inactiveScale +
    (
      config.activeScale -
      config.inactiveScale
    ) *
    activeAmount

  /*
   * Active wallpaper:
   *
   *     brightness = 1
   *
   * Inactive wallpaper:
   *
   *     brightness = 0.25
   */
  const brightness =
    0.25 +
    0.75 * activeAmount

  /*
   * Keep inactive items visible but subdued.
   */
  const opacity =
    0.45 +
    0.55 * activeAmount

  const visible =
    Math.abs(relativePosition) <=
    config.visibilityDistance

  return {
    x,
    y,
    z,
    rotationY,
    scale,
    opacity,
    brightness,
    visible,
    activeAmount,
  }
}

/**
 * Numerically approximates the slope of the equation.
 *
 * We don't require the equation engine to know calculus.
 *
 * For:
 *
 *     z = f(x)
 *
 * we approximate:
 *
 *     dz/dx ≈ (f(x+h) - f(x-h)) / 2h
 */
function calculateSlope(
  equation: Equation,
  x: number,
): number {
  const h = 0.001

  const before =
    equation.evaluateAt(
      x - h,
      0,
    )

  const after =
    equation.evaluateAt(
      x + h,
      0,
    )

  return (
    (after - before) /
    (2 * h)
  )
}

export function createCarouselMathConfig(
  expression: string,
  overrides: Partial<
    Omit<
      CarouselMathConfig,
      'equation'
    >
  > = {},
): CarouselMathConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    equation:
      new Equation(expression),
  }
}
