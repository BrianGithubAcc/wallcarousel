import type {
  ParametricEquation,
} from './parametricEquation'


export type CarouselPresetGroup =
  'Basics'


export interface CarouselPreset {
  id:
    string

  label:
    string

  group:
    CarouselPresetGroup

  description:
    string

  equation:
    ParametricEquation

  closedLoop:
    boolean
}


export const CAROUSEL_PRESET_GROUPS:
  CarouselPresetGroup[] = [
  'Basics',
]


export const CAROUSEL_PRESETS:
  CarouselPreset[] = [

  {
    id:
      'parabola',

    label:
      'Parabola',

    group:
      'Basics',

    description:
      'Classic curved wallpaper path.',

    equation: {
      x:
        't',

      y:
        '0',

      z:
        '-0.04 * t^2',
    },

    closedLoop:
      false,
  },


  {
    id:
      'wave',

    label:
      'Wave',

    group:
      'Basics',

    description:
      'Smooth wave through 3D space.',

    equation: {
      x:
        't',

      y:
        '2 * sin(t / 2)',

      z:
        '0.5 * cos(t)',
    },

    closedLoop:
      false,
  },


  {
    id:
      'helix',

    label:
      'Helix',

    group:
      'Basics',

    description:
      'Classic 3D helix.',

    equation: {
      x:
        '2 * cos(t)',

      y:
        '2 * sin(t)',

      z:
        '0.25 * t',
    },

    closedLoop:
      false,
  },


  {
    id:
      'circle',

    label:
      'Circle',

    group:
      'Basics',

    description:
      'Closed circular wallpaper carousel.',

    equation: {
      x:
        '3 * cos(t)',

      y:
        '3 * sin(t)',

      z:
        '0.5 * sin(2 * t)',
    },

    closedLoop:
      true,
  },


  {
    id:
      'figure8',

    label:
      'Figure 8',

    group:
      'Basics',

    description:
      'Closed figure-eight path.',

    equation: {
      x:
        '3 * sin(t)',

      y:
        '2 * sin(2 * t)',

      z:
        '0.5 * cos(t)',
    },

    closedLoop:
      true,
  },


  {
    id:
      'spiral',

    label:
      'Spiral',

    group:
      'Basics',

    description:
      'Expanding spiral through 3D space.',

    equation: {
      x:
        '0.35 * t * cos(t)',

      y:
        '0.35 * t * sin(t)',

      z:
        '0.15 * t',
    },

    closedLoop:
      false,
  },


]


export function getCarouselPreset(
  id:
    string,
) {
  return CAROUSEL_PRESETS.find(
    (
      preset,
    ) =>
      preset.id ===
      id,
  )
}


function sameExpression(
  a:
    string,

  b:
    string,
) {
  return (
    a.trim() ===
    b.trim()
  )
}


export function findMatchingCarouselPreset(
  equation:
    ParametricEquation,

  closedLoop:
    boolean,
) {
  return CAROUSEL_PRESETS.find(
    (
      preset,
    ) =>
      preset.closedLoop ===
        closedLoop &&

      sameExpression(
        preset.equation.x,
        equation.x,
      ) &&

      sameExpression(
        preset.equation.y,
        equation.y,
      ) &&

      sameExpression(
        preset.equation.z,
        equation.z,
      ),
  )
}
