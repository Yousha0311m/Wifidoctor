// AppLayout.tsx | SignalFLoor | Multi-theme responsive shell layout (titlebar + sidebar + main + studios)

import { useEffect, useState, type ReactNode } from 'react'
import FxCanvas from '@/components/fx/FxCanvas'
import { ToastContainer } from '@/components/ui/Kit'
import { useSettings } from '@/hooks/useSettings'
import CommandPalette from './CommandPalette'
import ConnectDeviceModal from './ConnectDeviceModal'
import FxStudioModal from './FxStudioModal'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout({ children }: { children: ReactNode }) {
  useSettings()
  const [cmdOpen, setCmdOpen] = useState(false)
  const [fxOpen, setFxOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <FxCanvas />
      <Topbar
        onOpenCommand={() => setCmdOpen(true)}
        onOpenThemeStudio={() => setFxOpen(true)}
        onOpenDevice={() => setDeviceOpen(true)}
      />
      <div className="shell">
        <Sidebar onOpenFxStudio={() => setFxOpen(true)} />
        <main className="main">
          <div className="view">{children}</div>
        </main>
      </div>
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onOpenFxStudio={() => setFxOpen(true)}
        onOpenDevice={() => setDeviceOpen(true)}
      />
      <FxStudioModal open={fxOpen} onClose={() => setFxOpen(false)} />
      <ConnectDeviceModal open={deviceOpen} onClose={() => setDeviceOpen(false)} />
      <ToastContainer />
    </>
  )
}
