// Sidebar.tsx | SignalFLoor | Floating rounded liquid-glass navigation sidebar with Geymars attribution

import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Database,
  Flame,
  FileText,
  Gauge,
  LayoutDashboard,
  Map as MapIcon,
  Radar,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import { loadDemoWorkspace } from '@/lib/workspace'

const ROUTES = ['/', '/floor-plans', '/scans', '/heatmap', '/reports', '/utilities'] as const

export default function Sidebar({ onOpenFxStudio }: { onOpenFxStudio: () => void }) {
  const { pathname } = useLocation()
  const { rooms } = useFloor()
  const { points } = useScan()
  const navRef = useRef<HTMLElement>(null)
  const [indicatorY, setIndicatorY] = useState(0)

  const nav = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard, badge: null },
    { label: 'Floor Plans', to: '/floor-plans', icon: MapIcon, badge: rooms.length || null },
    { label: 'Scans', to: '/scans', icon: Radar, badge: points.length || null },
    { label: 'Heatmap', to: '/heatmap', icon: Flame, badge: null },
    { label: 'Reports', to: '/reports', icon: FileText, badge: null },
    { label: 'Wi-Fi Utilities', to: '/utilities', icon: Gauge, badge: null },
  ]

  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const idx = Math.max(0, ROUTES.indexOf(pathname as (typeof ROUTES)[number]))
    const links = el.querySelectorAll<HTMLAnchorElement>('a.nav-item')
    const target = links[idx]
    if (target) setIndicatorY(target.offsetTop)
  }, [pathname])

  return (
    <aside className="sidebar glass">
      <p className="eyebrow px-3 mb-2">Navigation</p>

      <nav ref={navRef} className="nav" aria-label="Sections">
        <span
          className="nav-indicator"
          style={{ transform: `translateY(${indicatorY}px)` }}
        >
          <span className="nav-bar" />
        </span>

        {nav.map(({ label, to, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => sound.click()}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} />
            <span className="nav-label">{label}</span>
            {badge !== null && <span className="nav-badge">{badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            const res = loadDemoWorkspace()
            toast(`Loaded ${res.rooms} sample rooms & ${res.points} scans.`, 'success')
          }}
        >
          <Database size={14} />
          Load Demo Home
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onOpenFxStudio}
        >
          <SlidersHorizontal size={14} />
          UI Themes &amp; FX
        </Button>

        <div className="side-version">Built by Geymars</div>
      </div>
    </aside>
  )
}
