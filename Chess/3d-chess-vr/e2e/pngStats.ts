import { inflateSync } from 'zlib'

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Mean and variance of RGB sums in a PNG. Playwright canvas screenshots are PNG. */
export function pngStats(buffer: Buffer): { mean: number; variance: number } {
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 6
  const chunks: Buffer[] = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') {
      chunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  let cursor = 0
  let previous = Buffer.alloc(stride)
  let sum = 0
  let sum2 = 0
  let count = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor]
    cursor += 1
    const row = Buffer.alloc(stride)
    for (let index = 0; index < stride; index += 1) {
      const value = raw[cursor]
      cursor += 1
      const left = index >= channels ? row[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      let reconstructed = value
      if (filter === 1) reconstructed = (value + left) & 255
      else if (filter === 2) reconstructed = (value + up) & 255
      else if (filter === 3) reconstructed = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) reconstructed = (value + paeth(left, up, upLeft)) & 255
      row[index] = reconstructed
    }
    previous = row
    for (let index = 0; index < stride; index += channels) {
      const luminance = row[index] + row[index + 1] + row[index + 2]
      sum += luminance
      sum2 += luminance * luminance
      count += 1
    }
  }
  const mean = count === 0 ? 0 : sum / count
  return { mean, variance: count === 0 ? 0 : sum2 / count - mean * mean }
}
