import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { spring } from '../../lib/motion'
import { Check, ChevronRight } from './icons'
import { cn } from '../../lib/cn'

// the panel every menu in the app is drawn in: right-click menus, the sort
// menu, the profile menu. it grows out of where it was opened from (the
// caller's origin-* class) on a spring, and is glass when glass is on
export function MenuPanel({
    className,
    style,
    children,
    onClick,
    onPointerEnter,
    onPointerLeave,
    ref,
}: {
    className?: string
    style?: CSSProperties
    children: ReactNode
    onClick?: (e: React.MouseEvent) => void
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    ref?: Ref<HTMLDivElement>
}) {
    const own = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => own.current as HTMLDivElement, [])

    return (
        <motion.div
            ref={own}
            role='menu'
            style={style}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.smooth}
            onClick={onClick}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            className={cn('float z-50 min-w-48 rounded-(--r-menu) p-1', className)}
        >
            {children}
        </motion.div>
    )
}

type ItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode
    checked?: boolean
    danger?: boolean
    hint?: string
    // a row that opens a menu of its own: the caret on the right says so
    more?: boolean
}

export function MenuItem({ icon, checked, danger, hint, more, className, children, ...rest }: ItemProps) {
    return (
        <button
            type='button'
            role='menuitem'
            className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-[max(0.125rem,calc(var(--r-menu)-0.25rem))] px-2 text-left text-[0.8125rem] transition-colors duration-100',
                danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-3',
                'disabled:pointer-events-none disabled:opacity-40',
                className,
            )}
            {...rest}
        >
            {icon && <span className={cn('grid w-4 shrink-0 place-items-center', !danger && 'text-muted')}>{icon}</span>}
            <span className='min-w-0 flex-1 truncate'>
                {children}
                {hint && <span className='ml-2 text-muted'>{hint}</span>}
            </span>
            {checked && <Check size={14} className='shrink-0 text-accent' />}
            {more && <ChevronRight size={14} className='shrink-0 text-muted' />}
        </button>
    )
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className='truncate px-2 pt-2 pb-1 text-[0.75rem] text-muted'>{children}</div>

export const MenuSep = () => <div className='mx-2 my-1 h-px bg-line' />

/*
 * A row that opens a second menu beside it - Add to, in the track menu.
 *
 * The old one closed the moment the pointer left the row, and between the row
 * and the menu it opened there was a gap: on the way across, the pointer was
 * over neither, and the menu was gone before it arrived. Here leaving only
 * starts a short wait. Arriving anywhere in the row or its menu calls it off,
 * so the gap, a diagonal path over the rows below, or an overshoot all keep it
 * open; resting somewhere else for the length of the wait closes it.
 *
 * The menu is fixed and placed against the window, so it opens on whichever
 * side has room and never runs off the bottom.
 */
const LINGER = 320

export function Submenu({ icon, label, width = 224, children }: { icon?: ReactNode; label: ReactNode; width?: number; children: ReactNode }) {
    const [open, set_open] = useState(false)
    const [place, set_place] = useState<{ left: number; top: number; flip: boolean } | null>(null)
    const row = useRef<HTMLDivElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    const show = () => {
        clearTimeout(timer.current)
        set_open(true)
    }

    const linger = () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => set_open(false), LINGER)
    }

    useEffect(() => () => clearTimeout(timer.current), [])

    useLayoutEffect(() => {
        if (!open) return

        const from = row.current?.getBoundingClientRect()
        const box = panel.current
        if (!from || !box) return

        const height = box.offsetHeight
        const right = from.right + 4
        const left = right + width > window.innerWidth - 8 ? from.left - 4 - width : right
        const top = Math.max(8, Math.min(from.top - 4, window.innerHeight - height - 8))

        set_place({ left, top, flip: left < from.left })
    }, [open, width])

    return (
        <div
            ref={row}
            onPointerEnter={show}
            onPointerLeave={linger}
            onKeyDown={(e) => {
                if (e.key === 'ArrowRight') show()
                if (e.key === 'ArrowLeft') set_open(false)
            }}
        >
            {/* the menu closes on any click, so this one has to stay put */}
            <MenuItem
                icon={icon}
                more
                aria-haspopup='menu'
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation()
                    show()
                }}
                className={open ? 'bg-surface-3' : ''}
            >
                {label}
            </MenuItem>
            {/* in the body, not in the menu: a menu of glass has a backdrop
                filter, and that makes it the box a fixed child is placed in */}
            {open &&
                createPortal(
                <MenuPanel
                    ref={panel}
                    onPointerEnter={show}
                    onPointerLeave={linger}
                    className={place?.flip ? 'fixed origin-top-right' : 'fixed origin-top-left'}
                    style={{ width, ...(place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }) }}
                >
                    {children}
                </MenuPanel>,
                    document.body,
                )}
        </div>
    )
}
