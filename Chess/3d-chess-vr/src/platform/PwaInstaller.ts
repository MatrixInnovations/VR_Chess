export class PwaInstaller {
  register(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js')
    })
  }
}
