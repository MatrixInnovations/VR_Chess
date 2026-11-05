export class Position {
  x: number
  y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  inBounds(): boolean {
    return this.x >= 0 && this.x < 8 && this.y >= 0 && this.y < 8
  }

  offset(dx: number, dy: number): Position {
    return new Position(this.x + dx, this.y + dy)
  }

  equals(other: Position | null | undefined): boolean {
    return !!other && this.x === other.x && this.y === other.y
  }

  /**
   * Algebraic square. File a is x = 0. Rank 1 is y = 7 (white's back rank).
   */
  toAlgebraic(): string {
    return `${String.fromCharCode(97 + this.x)}${8 - this.y}`
  }

  static fromAlgebraic(square: string): Position {
    const file = square.charCodeAt(0) - 97
    const rank = Number(square[1])
    return new Position(file, 8 - rank)
  }
}
