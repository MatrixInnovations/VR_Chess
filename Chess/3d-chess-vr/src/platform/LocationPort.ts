export interface LocationPort {
  readonly origin: string
  readonly search: string
  assign(url: string): void
  stripQuery(): void
}

export class BrowserLocation implements LocationPort {
  get origin(): string {
    return window.location.origin
  }

  get search(): string {
    return window.location.search
  }

  assign(url: string): void {
    window.location.assign(url)
  }

  stripQuery(): void {
    window.history.replaceState({}, '', window.location.pathname)
  }
}
