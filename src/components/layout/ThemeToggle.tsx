// ThemeToggle.tsx | SignalFLoor | Titlebar theme switcher pill

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { sound } from '@/lib/sounds'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={() => {
        sound.toggle(theme !== 'dark')
        toggle()
      }}
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to monochrome dark glass'}
      className="tb-pill interactive"
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}
