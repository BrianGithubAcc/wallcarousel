import type {
  BinaryNode,
  ComparisonNode,
  ConstantNode,
  ExpressionNode,
  FunctionNode,
  NumberNode,
  UnaryNode,
  VariableNode,
} from './EquationTypes'

export interface EvaluationContext {
  x: number
  y: number
}

type MathFunction = (value: number) => number

const FUNCTIONS: Record<string, MathFunction> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  log: Math.log,
  round: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
}

export class EquationEvaluator {
  evaluate(
    node: ExpressionNode,
    context: EvaluationContext,
  ): number {
    switch (node.type) {
      case 'number':
        return this.evaluateNumber(node)

      case 'variable':
        return this.evaluateVariable(node, context)

      case 'constant':
        return this.evaluateConstant(node)

      case 'binary':
        return this.evaluateBinary(node, context)

      case 'unary':
        return this.evaluateUnary(node, context)

      case 'function':
        return this.evaluateFunction(node, context)

      case 'comparison':
        return this.evaluateComparison(node, context)

      case 'conditional':
        return this.evaluateConditional(node, context)

      case 'piecewise':
        return this.evaluatePiecewise(node, context)

      default:
        return assertNever(node)
    }
  }

  private evaluateNumber(
    node: NumberNode,
  ): number {
    return node.value
  }

  private evaluateVariable(
    node: VariableNode,
    context: EvaluationContext,
  ): number {
    return context[node.name]
  }

  private evaluateConstant(
    node: ConstantNode,
  ): number {
    switch (node.name) {
      case 'pi':
        return Math.PI

      case 'e':
        return Math.E

      default:
        return assertNever(node.name)
    }
  }

  private evaluateBinary(
    node: BinaryNode,
    context: EvaluationContext,
  ): number {
    const left = this.evaluate(
      node.left,
      context,
    )

    const right = this.evaluate(
      node.right,
      context,
    )

    switch (node.operator) {
      case '+':
        return left + right

      case '-':
        return left - right

      case '*':
        return left * right

      case '/':
        if (right === 0) {
          throw new Error(
            'Division by zero',
          )
        }

        return left / right

      case '^':
        return Math.pow(left, right)

      default:
        return assertNever(node.operator)
    }
  }

  private evaluateUnary(
    node: UnaryNode,
    context: EvaluationContext,
  ): number {
    const value = this.evaluate(
      node.operand,
      context,
    )

    switch (node.operator) {
      case '+':
        return value

      case '-':
        return -value

      default:
        return assertNever(node.operator)
    }
  }

  private evaluateFunction(
    node: FunctionNode,
    context: EvaluationContext,
  ): number {
    const functionToCall =
      FUNCTIONS[node.name]

    if (!functionToCall) {
      throw new Error(
        `Unknown function "${node.name}"`,
      )
    }

    const argument = this.evaluate(
      node.argument,
      context,
    )

    const result =
      functionToCall(argument)

    if (!Number.isFinite(result)) {
      throw new Error(
        `Function "${node.name}" returned an invalid result`,
      )
    }

    return result
  }

  private evaluateComparison(
    node: ComparisonNode,
    context: EvaluationContext,
  ): number {
    const left = this.evaluate(
      node.left,
      context,
    )

    const right = this.evaluate(
      node.right,
      context,
    )

    switch (node.operator) {
      case '<':
        return left < right ? 1 : 0

      case '<=':
        return left <= right ? 1 : 0

      case '>':
        return left > right ? 1 : 0

      case '>=':
        return left >= right ? 1 : 0

      case '==':
        return left === right ? 1 : 0

      case '!=':
        return left !== right ? 1 : 0

      default:
        return assertNever(node.operator)
    }
  }

  private evaluateConditional(
    node: Extract<
      ExpressionNode,
      { type: 'conditional' }
    >,
    context: EvaluationContext,
  ): number {
    const condition =
      this.evaluateComparison(
        node.condition,
        context,
      )

    if (condition !== 0) {
      return this.evaluate(
        node.whenTrue,
        context,
      )
    }

    return this.evaluate(
      node.whenFalse,
      context,
    )
  }

  private evaluatePiecewise(
    node: Extract<
      ExpressionNode,
      { type: 'piecewise' }
    >,
    context: EvaluationContext,
  ): number {
    for (const branch of node.branches) {
      const condition =
        this.evaluateComparison(
          branch.condition,
          context,
        )

      if (condition !== 0) {
        return this.evaluate(
          branch.expression,
          context,
        )
      }
    }

    if (node.otherwise) {
      return this.evaluate(
        node.otherwise,
        context,
      )
    }

    throw new Error(
      'No piecewise condition matched and no otherwise expression was provided',
    )
  }
}

function assertNever(
  value: never,
): never {
  throw new Error(
    `Unhandled expression node: ${String(value)}`,
  )
}

export function evaluateEquation(
  node: ExpressionNode,
  context: EvaluationContext,
): number {
  return new EquationEvaluator().evaluate(
    node,
    context,
  )
}
