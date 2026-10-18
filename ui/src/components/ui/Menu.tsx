import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Check } from './icons'
import { cn } from '../../lib/cn'

// the panel every menu in the app is drawn in: right-click menus, the sort
// menu, the profile menu. solid, with the same edge as the cards
export function MenuPanel({ className, style, children, onClick }: { className?: string; style?: CSSProperties; children: ReactNode; onClick?: (e: React.MouseEvent) => void }) {
    return (
        <div
            role='menu'
            style={style}
            onClick={onClick}
            onContextMenu={(e) => e.preventDefault()}
            className={cn('edge z-50 min-w-48 animate-pop-in rounded-xl bg-surface-2 p-1.5 shadow-soft', className)}
        >
            {children}
        </div>
    )
}

type ItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode
    checked?: boolean
    danger?: boolean
    hint?: string
}

export function MenuItem({ icon, checked, danger, hint, className, children, ...rest }: ItemProps) {
    return (
        <button
            type='button'
            role='menuitem'
            className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[0.8rem] transition-colors',
                danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-3',
                'disabled:pointer-events-none disabled:opacity-40',
                className,
            )}
            {...rest}
        >
            {icon && <span className={cn('grid w-4 place-items-center', danger ? '' : 'text-muted')}>{icon}</span>}
            <span className='min-w-0 flex-1 truncate'>
                {children}
                {hint && <span className='ml-2 text-muted'>{hint}</span>}
            </span>
            {checked && <Check size={14} className='text-accent' />}
        </button>
    )
}

export const MenuLabel = ({ children }: { children: ReactNode }) => (
    <div className='px-2.5 pt-1.5 pb-1 text-[0.68rem] font-medium tracking-wide text-muted uppercase'>{children}</div>
)

export const MenuSep = () => <div className='mx-1.5 my-1 h-px bg-line' />
