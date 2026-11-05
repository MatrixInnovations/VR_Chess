import { useEffect, useState } from 'react'
import { AppShell } from './AppShell'
import { HallCanvas } from './HallCanvas'
import { Hud } from './Hud'

export function ClientHall() {
  const [shell, setShell] = useState<AppShell | null>(null)

  useEffect(() => {
    const app = AppShell.create()
    app.boot()
    setShell(app)
  }, [])

  if (!shell) return <div className="booting">Opening the hall…</div>

  return (
    <main className="hall-app">
      <HallCanvas shell={shell} />
      <Hud shell={shell} />
    </main>
  )
}
