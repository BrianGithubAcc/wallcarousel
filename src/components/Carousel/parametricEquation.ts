import {
  Equation,
} from '../../math/Equation'

export interface ParametricEquation {
  x: string
  y: string
  z: string
}

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface CompiledParametricEquation {
  x: Equation
  y: Equation
  z: Equation
}

export interface ArcLengthTable {
  ts: number[]
  lengths: number[]

  totalLength: number
  zeroLength: number

  minT: number
  maxT: number
}

export type EquationPreset =
  | 'custom'
  | 'parabola'
  | 'wave'
  | 'helix'
  | 'circle'
  | 'figure8'
  | 'spiral'

export const EQUATION_PRESETS: Record<
  Exclude<EquationPreset, 'custom'>,
  ParametricEquation
> = {
  parabola: {
    x: 't',
    y: '0',
    z: '-0.04 * t^2',
  },

  wave: {
    x: 't',
    y: '2 * sin(t / 2)',
    z: '0.5 * cos(t)',
  },

  helix: {
    x: '2 * cos(t)',
    y: '2 * sin(t)',
    z: '0.25 * t',
  },

  circle: {
    x: '3 * cos(t)',
    y: '3 * sin(t)',
    z: '0.5 * sin(2 * t)',
  },

  figure8: {
    x: '3 * sin(t)',
    y: '2 * sin(2 * t)',
    z: '0.5 * cos(t)',
  },

  spiral: {
    x: '0.35 * t * cos(t)',
    y: '0.35 * t * sin(t)',
    z: '0.15 * t',
  },
}

export const DEFAULT_EQUATION:
  ParametricEquation = {
  x: 't',
  y: '0',
  z: '-0.04 * t^2',
}

/*
 * This is now PHYSICAL DISTANCE ALONG
 * THE CURVE, not simply Δt.
 *
 * Wallpaper width = 3.2
 * Arc distance = 4.5
 *
 * Therefore neighbouring cards normally
 * have about 1.3 world units of clearance.
 */
export const WALLPAPER_SPACING =
  4.5

function parserExpression(
  expression: string,
) {
  return expression.replace(
    /\bt\b/g,
    'x',
  )
}

export function compileParametricEquation(
  equation: ParametricEquation,
): CompiledParametricEquation {
  return {
    x: new Equation(
      parserExpression(
        equation.x,
      ),
    ),

    y: new Equation(
      parserExpression(
        equation.y,
      ),
    ),

    z: new Equation(
      parserExpression(
        equation.z,
      ),
    ),
  }
}

export function evaluateCompiledEquation(
  equation:
    CompiledParametricEquation,
  t: number,
): Point3 {
  return {
    x: Number(
      equation.x.evaluateAt(
        t,
        0,
      ),
    ),

    y: Number(
      equation.y.evaluateAt(
        t,
        0,
      ),
    ),

    z: Number(
      equation.z.evaluateAt(
        t,
        0,
      ),
    ),
  }
}

export function evaluateParametric(
  expression: string,
  t: number,
): number {
  const equation =
    new Equation(
      parserExpression(
        expression,
      ),
    )

  return Number(
    equation.evaluateAt(
      t,
      0,
    ),
  )
}

export function evaluateEquation(
  equation: ParametricEquation,
  t: number,
): Point3 {
  return evaluateCompiledEquation(
    compileParametricEquation(
      equation,
    ),
    t,
  )
}

function finitePoint(
  point: Point3,
) {
  return (
    Number.isFinite(
      point.x,
    ) &&
    Number.isFinite(
      point.y,
    ) &&
    Number.isFinite(
      point.z,
    )
  )
}

function pointDistance(
  a: Point3,
  b: Point3,
) {
  const dx =
    b.x -
    a.x

  const dy =
    b.y -
    a.y

  const dz =
    b.z -
    a.z

  return Math.sqrt(
    dx * dx +
    dy * dy +
    dz * dz,
  )
}

/*
 * Numerically measure cumulative distance
 * along a parametric curve.
 *
 * This converts:
 *
 *   t -> distance along path
 *
 * The inverse lookup below converts:
 *
 *   distance along path -> t
 *
 * That is what lets wallpapers use constant
 * physical spacing even when the equation
 * changes speed dramatically with t.
 */
export function buildArcLengthTable(
  equation:
    CompiledParametricEquation,
  minT: number,
  maxT: number,
  sampleCount = 4096,
): ArcLengthTable {
  const samples =
    Math.max(
      64,
      Math.floor(
        sampleCount,
      ),
    )

  const ts:
    number[] =
    new Array(
      samples +
      1,
    )

  const lengths:
    number[] =
    new Array(
      samples +
      1,
    )

  let total =
    0

  let previous:
    Point3 | null =
    null

  for (
    let index = 0;
    index <=
    samples;
    index += 1
  ) {
    const amount =
      index /
      samples

    const t =
      minT +
      (
        maxT -
        minT
      ) *
        amount

    ts[index] =
      t

    try {
      const point =
        evaluateCompiledEquation(
          equation,
          t,
        )

      if (
        finitePoint(
          point,
        )
      ) {
        if (
          previous
        ) {
          total +=
            pointDistance(
              previous,
              point,
            )
        }

        previous =
          point
      } else {
        previous =
          null
      }
    } catch {
      previous =
        null
    }

    lengths[index] =
      total
  }

  const table: ArcLengthTable = {
    ts,
    lengths,

    totalLength:
      total,

    zeroLength:
      0,

    minT,
    maxT,
  }

  table.zeroLength =
    arcLengthAtT(
      table,
      0,
    )

  return table
}

/*
 * Interpolate cumulative arc length at t.
 */
export function arcLengthAtT(
  table:
    ArcLengthTable,
  t: number,
) {
  if (
    t <=
    table.minT
  ) {
    return 0
  }

  if (
    t >=
    table.maxT
  ) {
    return table.totalLength
  }

  const ts =
    table.ts

  let low =
    0

  let high =
    ts.length -
    1

  while (
    high -
    low >
    1
  ) {
    const middle =
      Math.floor(
        (
          low +
          high
        ) /
        2,
      )

    if (
      ts[middle] <=
      t
    ) {
      low =
        middle
    } else {
      high =
        middle
    }
  }

  const t0 =
    ts[low]

  const t1 =
    ts[high]

  const span =
    t1 -
    t0

  if (
    Math.abs(
      span,
    ) <
    1e-12
  ) {
    return table.lengths[
      low
    ]
  }

  const fraction =
    (
      t -
      t0
    ) /
    span

  return (
    table.lengths[
      low
    ] +
    (
      table.lengths[
        high
      ] -
      table.lengths[
        low
      ]
    ) *
      fraction
  )
}

/*
 * Invert cumulative arc length.
 *
 * This is the key operation:
 *
 * desired physical distance -> t
 */
export function tAtArcLength(
  table:
    ArcLengthTable,
  distance: number,
) {
  if (
    table.ts.length ===
      0
  ) {
    return 0
  }

  if (
    table.totalLength <=
    1e-9
  ) {
    return 0
  }

  const target =
    Math.max(
      0,
      Math.min(
        table.totalLength,
        distance,
      ),
    )

  const lengths =
    table.lengths

  let low =
    0

  let high =
    lengths.length -
    1

  while (
    high -
    low >
    1
  ) {
    const middle =
      Math.floor(
        (
          low +
          high
        ) /
        2,
      )

    if (
      lengths[middle] <=
      target
    ) {
      low =
        middle
    } else {
      high =
        middle
    }
  }

  const length0 =
    lengths[low]

  const length1 =
    lengths[high]

  const span =
    length1 -
    length0

  if (
    span <=
    1e-12
  ) {
    return table.ts[
      low
    ]
  }

  const fraction =
    (
      target -
      length0
    ) /
    span

  return (
    table.ts[
      low
    ] +
    (
      table.ts[
        high
      ] -
      table.ts[
        low
      ]
    ) *
      fraction
  )
}

/*
 * Open equations usually have no finite
 * "total length".
 *
 * We expand around t=0 until there is enough
 * measured curve on BOTH sides to contain the
 * requested physical arc distance.
 */
export function buildOpenArcLengthTable(
  equation:
    CompiledParametricEquation,
  requiredDistance: number,
): ArcLengthTable {
  const required =
    Math.max(
      WALLPAPER_SPACING,
      requiredDistance,
    )

  let extent =
    1

  let table =
    buildArcLengthTable(
      equation,
      -extent,
      extent,
      2048,
    )

  for (
    let attempt = 0;
    attempt < 12;
    attempt += 1
  ) {
    const leftLength =
      table.zeroLength

    const rightLength =
      table.totalLength -
      table.zeroLength

    if (
      leftLength >=
        required &&
      rightLength >=
        required
    ) {
      return table
    }

    extent *=
      2

    const samples =
      Math.min(
        8192,
        Math.max(
          2048,
          Math.ceil(
            extent *
            256,
          ),
        ),
      )

    /*
     * Keep sample count even so t=0 lands
     * exactly on one sample.
     */
    const evenSamples =
      samples %
        2 ===
      0
        ? samples
        : samples +
          1

    table =
      buildArcLengthTable(
        equation,
        -extent,
        extent,
        evenSamples,
      )
  }

  return table
}

/*
 * Signed distance measured from t=0.
 *
 * -distance -> backwards along path
 * +distance -> forwards along path
 */
export function tAtSignedArcDistance(
  table:
    ArcLengthTable,
  distance: number,
) {
  return tAtArcLength(
    table,
    table.zeroLength +
      distance,
  )
}

export function wrapCentered(
  value: number,
  period: number,
) {
  if (
    period <= 0
  ) {
    return value
  }

  const half =
    period /
    2

  return (
    (
      (
        (
          value +
          half
        ) %
          period +
        period
      ) %
        period
    ) -
    half
  )
}

export function wallpaperRelativeIndex(
  index: number,
  position: number,
  count: number,
  infiniteScroll: boolean,
) {
  const raw =
    index -
    position

  if (
    !infiniteScroll ||
    count <=
      1
  ) {
    return raw
  }

  return wrapCentered(
    raw,
    count,
  )
}

/*
 * Compatibility helper for any older code.
 *
 * New Carousel.tsx uses ARC LENGTH instead.
 */
export function wallpaperParameter(
  index: number,
  position: number,
  count = 0,
  infiniteScroll = false,
  closedLoop = false,
): number {
  const relative =
    wallpaperRelativeIndex(
      index,
      position,
      count,
      infiniteScroll,
    )

  if (
    closedLoop &&
    count >
      0
  ) {
    return (
      relative *
      (
        Math.PI *
        2 /
        count
      )
    )
  }

  return (
    relative *
    WALLPAPER_SPACING
  )
}

export function toThreeCoordinates(
  point: Point3,
): Point3 {
  return {
    x:
      point.x,

    y:
      point.z,

    z:
      point.y,
  }
}

export function fromThreeCoordinates(
  point: Point3,
): Point3 {
  return {
    x:
      point.x,

    y:
      point.z,

    z:
      point.y,
  }
}
