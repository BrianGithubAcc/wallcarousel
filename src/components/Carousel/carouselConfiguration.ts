import {
  DEFAULT_EQUATION,
} from './parametricEquation'

import type {
  ParametricEquation,
  Point3,
} from './parametricEquation'

import type {
  CarouselCardOrientation,
} from './carousel.types'


export const CAROUSEL_CONFIGURATION_KEY =
  'wallcarousel.carousel.configuration.v1'


export interface CarouselConfiguration {
  equation:
    ParametricEquation

  fadeAmount:
    number

  centerPoint:
    Point3

  minBrightness:
    number

  brightnessSoftening:
    number

  infiniteScroll:
    boolean

  closedLoop:
    boolean

  cardOrientation:
    CarouselCardOrientation
}


export const DEFAULT_CAROUSEL_CONFIGURATION:
  CarouselConfiguration = {
  equation: {
    ...DEFAULT_EQUATION,
  },

  fadeAmount:
    55,

  centerPoint: {
    x: 0,
    y: 0,
    z: 0,
  },

  minBrightness:
    0.15,

  brightnessSoftening:
    2.5,

  infiniteScroll:
    false,

  closedLoop:
    false,

  cardOrientation:
    'camera',
}


function finiteNumber(
  value: unknown,
  fallback: number,
) {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  )
    ? value
    : fallback
}


function validString(
  value: unknown,
  fallback: string,
) {
  return (
    typeof value ===
      'string' &&
    value.trim().length >
      0
  )
    ? value
    : fallback
}


export function loadCarouselConfiguration():
  CarouselConfiguration {
  if (
    typeof window ===
    'undefined'
  ) {
    return {
      ...DEFAULT_CAROUSEL_CONFIGURATION,

      equation: {
        ...DEFAULT_CAROUSEL_CONFIGURATION
          .equation,
      },

      centerPoint: {
        ...DEFAULT_CAROUSEL_CONFIGURATION
          .centerPoint,
      },
    }
  }

  try {
    const raw =
      window.localStorage.getItem(
        CAROUSEL_CONFIGURATION_KEY,
      )

    if (
      !raw
    ) {
      return {
        ...DEFAULT_CAROUSEL_CONFIGURATION,

        equation: {
          ...DEFAULT_CAROUSEL_CONFIGURATION
            .equation,
        },

        centerPoint: {
          ...DEFAULT_CAROUSEL_CONFIGURATION
            .centerPoint,
        },
      }
    }

    const value =
      JSON.parse(
        raw,
      ) as Partial<
        CarouselConfiguration
      >

    const equation =
      value.equation as
        | Partial<
            ParametricEquation
          >
        | undefined

    const center =
      value.centerPoint as
        | Partial<Point3>
        | undefined

    return {
      equation: {
        x:
          validString(
            equation?.x,
            DEFAULT_EQUATION.x,
          ),

        y:
          validString(
            equation?.y,
            DEFAULT_EQUATION.y,
          ),

        z:
          validString(
            equation?.z,
            DEFAULT_EQUATION.z,
          ),
      },

      fadeAmount:
        finiteNumber(
          value.fadeAmount,
          55,
        ),

      centerPoint: {
        x:
          finiteNumber(
            center?.x,
            0,
          ),

        y:
          finiteNumber(
            center?.y,
            0,
          ),

        z:
          finiteNumber(
            center?.z,
            0,
          ),
      },

      minBrightness:
        finiteNumber(
          value.minBrightness,
          0.15,
        ),

      brightnessSoftening:
        finiteNumber(
          value.brightnessSoftening,
          2.5,
        ),

      infiniteScroll:
        typeof value.infiniteScroll ===
          'boolean'
          ? value.infiniteScroll
          : false,

      closedLoop:
        typeof value.closedLoop ===
          'boolean'
          ? value.closedLoop
          : false,

      cardOrientation:
        value.cardOrientation ===
          'grid'
          ? 'grid'
          : 'camera',
    }
  } catch (
    error
  ) {
    console.warn(
      'Could not load carousel configuration:',
      error,
    )

    return {
      ...DEFAULT_CAROUSEL_CONFIGURATION,

      equation: {
        ...DEFAULT_CAROUSEL_CONFIGURATION
          .equation,
      },

      centerPoint: {
        ...DEFAULT_CAROUSEL_CONFIGURATION
          .centerPoint,
      },
    }
  }
}


export function saveCarouselConfiguration(
  configuration:
    CarouselConfiguration,
) {
  if (
    typeof window ===
    'undefined'
  ) {
    return
  }

  try {
    window.localStorage.setItem(
      CAROUSEL_CONFIGURATION_KEY,

      JSON.stringify(
        configuration,
      ),
    )
  } catch (
    error
  ) {
    console.warn(
      'Could not save carousel configuration:',
      error,
    )
  }
}
