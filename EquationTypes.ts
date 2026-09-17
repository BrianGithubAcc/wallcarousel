export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'

export type ComparisonOperator =
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='

export type UnaryOperator =
  | '+'
  | '-'

export interface NumberNode {
  type: 'number'
  value: number
}

export interface VariableNode {
  type: 'variable'
  name: 'x' | 'y'
}

export interface ConstantNode {
  type: 'constant'
  name: 'pi' | 'e'
}

export interface BinaryNode {
  type: 'binary'
  operator: BinaryOperator
  left: ExpressionNode
  right: ExpressionNode
}

export interface UnaryNode {
  type: 'unary'
  operator: UnaryOperator
  operand: ExpressionNode
}

export interface FunctionNode {
  type: 'function'
  name: string
  argument: ExpressionNode
}

export interface ComparisonNode {
  type: 'comparison'
  operator: ComparisonOperator
  left: ExpressionNode
  right: ExpressionNode
}

export interface ConditionalNode {
  type: 'conditional'
  condition: ComparisonNode
  whenTrue: ExpressionNode
  whenFalse: ExpressionNode
}

export interface PiecewiseBranch {
  condition: ComparisonNode
  expression: ExpressionNode
}

export interface PiecewiseNode {
  type: 'piecewise'
  branches: PiecewiseBranch[]
  otherwise?: ExpressionNode
}

export type ExpressionNode =
  | NumberNode
  | VariableNode
  | ConstantNode
  | BinaryNode
  | UnaryNode
  | FunctionNode
  | ComparisonNode
  | ConditionalNode
  | PiecewiseNode
