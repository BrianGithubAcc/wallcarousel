import type {
  BinaryOperator,
  ComparisonOperator,
  ConstantNode,
  ExpressionNode,
  FunctionNode,
  NumberNode,
  UnaryNode,
  VariableNode,
} from './EquationTypes'

type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'comparison'
  | 'leftParen'
  | 'rightParen'
  | 'comma'
  | 'absolute'
  | 'eof'

interface Token {
  type: TokenType
  value: string
  position: number
}

class Lexer {
  private position = 0

  private readonly input: string

  constructor(input: string) {
    this.input = input
  }

  tokenize(): Token[] {
    const tokens: Token[] = []

    while (this.position < this.input.length) {
      const character = this.input[this.position]

      if (/\s/.test(character)) {
        this.position++
        continue
      }

      if (/[0-9.]/.test(character)) {
        tokens.push(this.readNumber())
        continue
      }

      if (/[a-zA-Z_]/.test(character)) {
        tokens.push(this.readIdentifier())
        continue
      }

      const twoCharacterOperator =
        this.input.slice(
          this.position,
          this.position + 2,
        )

      if (
        ['<=', '>=', '==', '!='].includes(
          twoCharacterOperator,
        )
      ) {
        tokens.push({
          type: 'comparison',
          value: twoCharacterOperator,
          position: this.position,
        })

        this.position += 2
        continue
      }

      if (
        ['+', '-', '*', '/', '^'].includes(
          character,
        )
      ) {
        tokens.push({
          type: 'operator',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      if (
        ['<', '>'].includes(character)
      ) {
        tokens.push({
          type: 'comparison',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      if (character === '(') {
        tokens.push({
          type: 'leftParen',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      if (character === ')') {
        tokens.push({
          type: 'rightParen',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      if (character === ',') {
        tokens.push({
          type: 'comma',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      /*
       * Absolute-value delimiter.
       *
       * Examples:
       *
       * |x|
       * |x|^3
       * |x + y|
       * -2 * |x|^3
       */
      if (character === '|') {
        tokens.push({
          type: 'absolute',
          value: character,
          position: this.position,
        })

        this.position++
        continue
      }

      throw new Error(
        `Unexpected character "${character}" at position ${this.position}`,
      )
    }

    tokens.push({
      type: 'eof',
      value: '',
      position: this.position,
    })

    return tokens
  }

  private readNumber(): Token {
    const start = this.position
    let hasDecimalPoint = false

    while (
      this.position < this.input.length
    ) {
      const character =
        this.input[this.position]

      if (character === '.') {
        if (hasDecimalPoint) {
          break
        }

        hasDecimalPoint = true
        this.position++
        continue
      }

      if (!/[0-9]/.test(character)) {
        break
      }

      this.position++
    }

    const value = this.input.slice(
      start,
      this.position,
    )

    if (value === '.') {
      throw new Error(
        `Invalid number at position ${start}`,
      )
    }

    return {
      type: 'number',
      value,
      position: start,
    }
  }

  private readIdentifier(): Token {
    const start = this.position

    while (
      this.position < this.input.length &&
      /[a-zA-Z0-9_]/.test(
        this.input[this.position],
      )
    ) {
      this.position++
    }

    return {
      type: 'identifier',
      value: this.input.slice(
        start,
        this.position,
      ),
      position: start,
    }
  }
}

export class EquationParser {
  private tokens: Token[] = []
  private position = 0

  parse(input: string): ExpressionNode {
    if (!input.trim()) {
      throw new Error(
        'Equation cannot be empty',
      )
    }

    this.tokens =
      new Lexer(input).tokenize()

    this.position = 0

    const expression =
      this.parseExpression()

    this.expect('eof')

    return expression
  }

  private parseExpression(): ExpressionNode {
    return this.parseComparison()
  }

  private parseComparison(): ExpressionNode {
    const left =
      this.parseAddition()

    const token = this.current()

    if (token.type !== 'comparison') {
      return left
    }

    this.position++

    const right =
      this.parseAddition()

    return {
      type: 'comparison',
      operator:
        token.value as ComparisonOperator,
      left,
      right,
    }
  }

  private parseAddition(): ExpressionNode {
    let left =
      this.parseMultiplication()

    while (true) {
      const token = this.current()

      if (
        token.type !== 'operator' ||
        !['+', '-'].includes(
          token.value,
        )
      ) {
        break
      }

      this.position++

      const right =
        this.parseMultiplication()

      left = {
        type: 'binary',
        operator:
          token.value as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  private parseMultiplication(): ExpressionNode {
    let left =
      this.parsePower()

    while (true) {
      const token = this.current()

      if (
        token.type !== 'operator' ||
        !['*', '/'].includes(
          token.value,
        )
      ) {
        break
      }

      this.position++

      const right =
        this.parsePower()

      left = {
        type: 'binary',
        operator:
          token.value as BinaryOperator,
        left,
        right,
      }
    }

    return left
  }

  private parsePower(): ExpressionNode {
    let left =
      this.parseUnary()

    const token = this.current()

    if (
      token.type === 'operator' &&
      token.value === '^'
    ) {
      this.position++

      const right =
        this.parsePower()

      left = {
        type: 'binary',
        operator: '^',
        left,
        right,
      }
    }

    return left
  }

  private parseUnary(): ExpressionNode {
    const token = this.current()

    if (
      token.type === 'operator' &&
      ['+', '-'].includes(
        token.value,
      )
    ) {
      this.position++

      const operand =
        this.parseUnary()

      const node: UnaryNode = {
        type: 'unary',
        operator:
          token.value as '+' | '-',
        operand,
      }

      return node
    }

    return this.parsePrimary()
  }

  private parsePrimary(): ExpressionNode {
    const token = this.current()

    /*
     * Absolute value:
     *
     * |x|
     *
     * becomes:
     *
     * abs(x)
     */
    if (token.type === 'absolute') {
      this.position++

      const expression =
        this.parseExpression()

      this.expect('absolute')

      const node: FunctionNode = {
        type: 'function',
        name: 'abs',
        argument: expression,
      }

      return node
    }

    if (token.type === 'number') {
      this.position++

      const node: NumberNode = {
        type: 'number',
        value: Number(token.value),
      }

      return node
    }

    if (token.type === 'identifier') {
      return this.parseIdentifier()
    }

    if (token.type === 'leftParen') {
      this.position++

      const expression =
        this.parseExpression()

      this.expect('rightParen')

      return expression
    }

    throw new Error(
      `Unexpected token "${token.value}" at position ${token.position}`,
    )
  }

  private parseIdentifier(): ExpressionNode {
    const token = this.current()

    this.position++

    const name =
      token.value.toLowerCase()

    if (
      name === 'x' ||
      name === 'y'
    ) {
      const node: VariableNode = {
        type: 'variable',
        name,
      }

      return node
    }

    if (
      name === 'pi' ||
      name === 'e'
    ) {
      const node: ConstantNode = {
        type: 'constant',
        name,
      }

      return node
    }

    if (
      this.current().type ===
      'leftParen'
    ) {
      this.position++

      const argument =
        this.parseExpression()

      this.expect('rightParen')

      const node: FunctionNode = {
        type: 'function',
        name,
        argument,
      }

      return node
    }

    throw new Error(
      `Unknown identifier "${token.value}" at position ${token.position}`,
    )
  }

  private current(): Token {
    return this.tokens[this.position]
  }

  private expect(
    type: TokenType,
  ): Token {
    const token = this.current()

    if (token.type !== type) {
      throw new Error(
        `Expected ${type} at position ${token.position}, got "${token.value}"`,
      )
    }

    this.position++

    return token
  }
}

export function parseEquation(
  input: string,
): ExpressionNode {
  return new EquationParser().parse(
    input,
  )
}
