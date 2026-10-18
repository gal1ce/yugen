import type { InputHTMLAttributes, ReactNode } from 'react'
import { Heart as HeartIcon } from './icons'
import { cn } from '../../lib/cn'
import { tip } from '../../lib/tip'

// role and aria-checked rather than a checkbox: the knob is a button, so it
// takes the same focus ring and press as every other control
export function Switch({ on, label, on_toggle }: { on: boolean; label: string; on_toggle: () => void }) {
    return (
        <button
            type='button'
            role='switch'
            aria-checked={on}
            aria-label={label}
            onClick={on_toggle}
            className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-surface-3')}
        >
            <span
                className={cn(
                    'absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform duration-300 ease-spring',
                    on && 'translate-x-4',
                )}
            />
        </button>
    )
}

// a row of choices where exactly one is on
export function Segmented<T extends string>({
    value,
    options,
    on_change,
    className,
}: {
    value: T
    options: { id: T; label: ReactNode; hint?: string }[]
    on_change: (id: T) => void
    className?: string
}) {
    return (
        <div className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type='button'
                    {...(option.hint ? tip(option.hint) : {})}
                    onClick={() => on_change(option.id)}
                    className={cn(
                        'flex h-7 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                        value === option.id ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg',
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

type RangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
    value: number
    min: number
    max: number
    on_change: (value: number) => void
}

export function Range({ value, min, max, on_change, className, style, ...rest }: RangeProps) {
    const fill = max > min ? ((value - min) / (max - min)) * 100 : 0

    return (
        <input
            type='range'
            min={min}
            max={max}
            value={value}
            onChange={(e) => on_change(Number(e.currentTarget.value))}
            className={cn('range', className)}
            style={{ ...style, '--fill': `${fill}%` } as React.CSSProperties}
            {...rest}
        />
    )
}

export function Heart({ liked, on_toggle, size = 16, className }: { liked: boolean; on_toggle: () => void; size?: number; className?: string }) {
    return (
        <button
            type='button'
            {...tip(liked ? 'Remove from liked songs' : 'Add to liked songs')}
            aria-pressed={liked}
            onClick={(e) => {
                e.stopPropagation()
                on_toggle()
            }}
            className={cn(
                'grid shrink-0 place-items-center transition-[color,scale] active:scale-90',
                liked ? 'text-accent' : 'text-muted hover:text-fg',
                className,
            )}
        >
            <HeartIcon size={size} className={liked ? 'fill-current' : ''} />
        </button>
    )
}

export function Empty({ icon, title, children, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
    return (
        <div className={cn('edge flex flex-col items-center justify-center rounded-2xl bg-surface/60 px-6 py-12 text-center', className)}>
            {icon && <div className='mb-3 text-muted'>{icon}</div>}
            <p className='text-sm font-medium'>{title}</p>
            {children && <div className='mt-1.5 max-w-sm text-xs text-muted'>{children}</div>}
        </div>
    )
}
