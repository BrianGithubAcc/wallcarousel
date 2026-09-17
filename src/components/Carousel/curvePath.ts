import { Equation } from '../../math/Equation'

export type PathPreset =
  | 'x'
  | 'y'
  | 'diagonal'
  | 'anti-diagonal'
  | 'sine'
  | 'circle'
  | 'spiral'
  | 'figure8'
  | 'custom'

export interface CurvePath {
  x: string
  y: string
}

export const PATH_PRESETS: Record<
  Exclude<PathPreset, 'custom'>,
  CurvePath
> = {
  x: {
    x: 't',
    y: '0',
  },

  y: {
    x: '0',
    y: 't',
  },

  diagonal: {
    x: 't',
    y: 't',
  },

  'anti-diagonal': {
    x: 't',
    y: '-t',
  },

  sine: {
    x: 't',
    y: '2 * sin(t / 2)',
  },

  circle: {
    x: '3 * cos(t)',
    y: '3 * sin(t)',
  },

  spiral: {
    x: '0.35 * t * cos(t)',
    y: '0.35 * t * sin(t)',
  },

  figure8: {
    x: '3 * sin(t)',
    y: '2 * sin(2 * t)',
  },
}

/*
 * The existing Equation parser understands x/y but not t.
 *
 * For a path expression we treat the parser's x variable
 * as our parameter t.
 */
export function evaluatePathExpression(
  expression: string,
  t: number,
): number {
  const parserExpression =
    expression.replace(
      /\bt\b/g,
      'x',
    )

  const equation =
    new Equation(
      parserExpression,
    )

  return Number(
    equation.evaluateAt(
      t,
      0,
    ),
  )
}

export function getCurvePath(
  preset: PathPreset,
  customX: string,
  customY: string,
): CurvePath {
  if (preset === 'custom') {
    return {
      x: customX || 't',
      y: customY || '0',
    }
  }

  return PATH_PRESETS[preset]
}
