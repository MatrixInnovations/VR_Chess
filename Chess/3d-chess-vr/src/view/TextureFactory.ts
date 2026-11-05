import * as THREE from 'three'

class ParkMiller {
  private seed: number

  constructor(seed: number) {
    this.seed = seed % 2147483647
    if (this.seed <= 0) this.seed += 2147483646
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return (this.seed - 1) / 2147483646
  }
}

export class TextureFactory {
  private readonly cache = new Map<string, THREE.CanvasTexture>()

  wood(key: string, base: string, grain: string, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
    const cached = this.cache.get(key)
    if (cached) return cached
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not draw wood')
    const rng = new ParkMiller(key.length * 131 + base.charCodeAt(1))
    context.fillStyle = base
    context.fillRect(0, 0, size, size)
    for (let row = 0; row < 26; row += 1) {
      context.strokeStyle = grain
      context.globalAlpha = 0.12 + rng.next() * 0.28
      context.lineWidth = 0.6 + rng.next() * 2.2
      const y = (row + rng.next()) * (size / 26)
      context.beginPath()
      context.moveTo(0, y)
      for (let x = 0; x <= size; x += 12) {
        context.lineTo(x, y + Math.sin(x * 0.04 + row) * (2 + rng.next() * 2))
      }
      context.stroke()
    }
    context.globalAlpha = 0.08
    for (let i = 0; i < 900; i += 1) {
      context.fillStyle = rng.next() > 0.5 ? '#000' : '#fff'
      context.fillRect(rng.next() * size, rng.next() * size, 1, 1)
    }
    const texture = this.finish(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeatX, repeatY)
    this.cache.set(key, texture)
    return texture
  }

  plaster(): THREE.CanvasTexture {
    const cached = this.cache.get('plaster')
    if (cached) return cached
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not draw plaster')
    context.fillStyle = '#d9cbb8'
    context.fillRect(0, 0, size, size)
    const rng = new ParkMiller(41)
    context.globalAlpha = 0.05
    for (let i = 0; i < 1400; i += 1) {
      context.fillStyle = rng.next() > 0.5 ? '#6a5a48' : '#fff8ee'
      context.fillRect(rng.next() * size, rng.next() * size, 2, 2)
    }
    const texture = this.finish(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2, 2)
    this.cache.set('plaster', texture)
    return texture
  }

  text(text: string, width: number, height: number, color = '#f4ead8'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not draw text')
    context.clearRect(0, 0, width, height)
    context.fillStyle = color
    context.font = `600 ${Math.floor(height * 0.46)}px Georgia, serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, width / 2, height / 2)
    return this.finish(canvas)
  }

  clockFace(time: string, active: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not draw the clock')
    context.fillStyle = active ? '#1a140c' : '#100e0c'
    context.fillRect(0, 0, 256, 128)
    context.fillStyle = active ? '#f2d48a' : '#8d7344'
    context.font = '600 72px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(time, 128, 68)
    return this.finish(canvas)
  }

  private finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 2
    texture.needsUpdate = true
    return texture
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose()
    this.cache.clear()
  }
}
