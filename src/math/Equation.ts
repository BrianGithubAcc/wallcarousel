import {
  evaluateEquation,
  type EvaluationContext,
} from './EquationEvaluator'

import {
  parseEquation,
} from './EquationParser'

import type {
  ExpressionNode,
} from './EquationTypes'

export class Equation {
  readonly expression: string
  readonly ast: ExpressionNode

  constructor(expression: string) {
    this.expression = expression.trim()

    if (!this.expression) {
      throw new Error(
        'Equation cannot be empty',
      )
    }

    this.ast =
      parseEquation(this.expression)
  }

  evaluate(
    context: EvaluationContext,
  ): number {
    return evaluateEquation(
      this.ast,
      context,
    )
  }

  evaluateAt(
    x: number,
    y = 0,
  ): number {
    return this.evaluate({
      x,
      y,
    })
  }
}

export function createEquation(
  expression: string,
): Equation {
  return new Equation(expression)
}
