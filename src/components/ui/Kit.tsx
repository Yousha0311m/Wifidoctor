// Kit.tsx | SignalFLoor | Liquid-Glass UI primitives (.btn, .panel.glass, .segmented, .switch, .modal, .toasts)

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react'
import { sound } from '@/lib/sounds'
import { subscribeToasts, type ToastItem, type ToastLevel } from '@/lib/toast'


type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost'
type BtnSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  silent?: boolean
  children: ReactNode
}

export function Button({
  variant = 'default',
  size = 'md',
  silent = false,
  className = '',
  onClick,
  onMouseEnter,
  children,
  ...rest
}: ButtonProps) {
  const vCls = variant === 'default' ? '' : variant
  const sCls = size === 'sm' ? 'sm' : ''

  return (
    <button
      type="button"
      className={`btn fx ${vCls} ${sCls} ${className}`.trim()}
      onMouseEnter={e => {
        if (!silent) sound.tick()
        onMouseEnter?.(e)
      }}
      onClick={e => {
        if (!silent) sound.click()
        onClick?.(e)
      }}
      {...rest}
    >
      <i className="shine" aria-hidden="true" />
      <span className="btn-content">{children}</span>
    </button>
  )
}

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src="/android-chrome-192x192.png"
      alt="Wi-Ma"
      width={size}
      height={size}
    />
  )
}

export function GlassCard({
  eyebrow,
  title,
  sub,
  icon,
  action,
  className = '',
  children,
}: {
  eyebrow?: string
  title?: string
  sub?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`panel glass ${className}`.trim()}>
      {(eyebrow || title || action) && (
        <header className="panel-head">
          <div className="panel-title-wrap">
            {icon && <div className="panel-ico">{icon}</div>}
            <div className="min-w-0">
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h2 className="truncate">{title}</h2>}
              {sub && <p className="truncate">{sub}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

type BadgeTone = 'ok' | 'warn' | 'err' | 'strong' | 'fair' | 'weak' | 'neutral'

const TONE_MAP: Record<BadgeTone, string> = {
  ok: 'ok',
  strong: 'ok',
  warn: 'warn',
  fair: 'warn',
  err: 'err',
  weak: 'err',
  neutral: '',
}

export function Badge({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span className={`chip ${TONE_MAP[tone]} ${className}`.trim()}>
      {children}
    </span>
  )
}

export interface SegOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [glider, setGlider] = useState({ x: 3, w: 0 })

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const idx = Math.max(0, options.findIndex(o => o.value === value))
    const btns = wrap.querySelectorAll<HTMLButtonElement>('button.seg')
    const target = btns[idx]
    if (target) {
      setGlider({ x: target.offsetLeft, w: target.offsetWidth })
    }
  }, [options, value])

  return (
    <div ref={wrapRef} role="tablist" className="segmented">
      <span
        className="seg-glider"
        style={{
          width: `${glider.w}px`,
          transform: `translateX(${glider.x}px)`,
        }}
      />
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`seg ${active ? 'active' : ''}`}
            onClick={() => {
              sound.click()
              onChange(opt.value)
            }}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => {
        const next = !checked
        sound.toggle(next)
        onChange(next)
      }}
    >
      <span className="knob" />
    </button>
  )
}

export function Modal({
  open,
  title,
  eyebrow,
  wide = false,
  onClose,
  footer,
  children,
}: {
  open: boolean
  title: string
  eyebrow?: string
  wide?: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    sound.open()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.close()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) {
          sound.close()
          onClose()
        }
      }}
    >
      <div role="dialog" aria-modal="true" className={`modal glass-strong ${wide ? 'wide' : ''}`}>
        <header className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="icon-btn"
            onClick={() => {
              sound.close()
              onClose()
            }}
          >
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      eyebrow="SignalFloor Asks"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onCancel()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--text-2)] leading-relaxed">{message}</p>
    </Modal>
  )
}

function ToastGlyph({ level }: { level: ToastLevel }) {
  if (level === 'success') return <CheckCircle2 size={17} className="text-[var(--ok-text)] shrink-0 mt-0.5" />
  if (level === 'warn') return <AlertTriangle size={17} className="text-[var(--warn-text)] shrink-0 mt-0.5" />
  if (level === 'error') return <ShieldAlert size={17} className="text-[var(--err-text)] shrink-0 mt-0.5" />
  return <Info size={17} className="text-[var(--text-2)] shrink-0 mt-0.5" />
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribeToasts(item => {
      setItems(prev => [...prev.slice(-3), item])
      setTimeout(() => {
        setItems(prev => prev.filter(x => x.id !== item.id))
      }, item.level === 'error' ? 5200 : 3800)
    })
  }, [])

  return (
    <div aria-live="polite" className="toasts">
      {items.map(item => (
        <div key={item.id} role="status" className="toast glass-strong">
          <ToastGlyph level={item.level} />
          <div className="min-w-0">
            <span className="from">SignalFloor</span>
            <p className="text-[13px] text-[var(--text)]">{item.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
