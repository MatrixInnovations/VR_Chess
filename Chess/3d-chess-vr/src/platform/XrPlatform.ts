export interface XrPlatform {
  enterImmersiveVr(): Promise<void>
  enterImmersiveAr(): Promise<void>
  exit(): Promise<void>
  onSessionEnd(listener: () => void): void
}
