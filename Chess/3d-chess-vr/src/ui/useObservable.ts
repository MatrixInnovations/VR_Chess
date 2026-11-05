import { useEffect, useState } from 'react'
import type { Observable } from '../domain/Observable'

export function useObservable(source: Observable | null | undefined): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!source) return
    return source.subscribe(() => setTick((tick) => tick + 1))
  }, [source])
}
