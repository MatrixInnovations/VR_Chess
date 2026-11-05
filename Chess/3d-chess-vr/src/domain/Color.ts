export type Color = 'white' | 'black'

export class Side {
  static opposite(color: Color): Color {
    return color === 'white' ? 'black' : 'white'
  }

  static label(color: Color): string {
    return color === 'white' ? 'White' : 'Black'
  }
}
