import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../../lib/motion'
import { Heart as HeartIcon } from './icons'
import { cn } from '../../lib/cn'
import { tip } from '../../lib/tip'

// role and aria-checked rather than a checkbox: the knob is a button, so it
// takes the same focus ring and press as every other control
export function Switch({ on, label, on_toggle, disabled }: { on: boolean; label: string; on_toggle: () => void; disabled?: boolean }) {
    return (
        <button
            type='button'
            role='switch'
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={on_toggle}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40', on ? 'bg-accent' : 'bg-surface-3')}
        >
            <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-fg shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-[translate,background-color] duration-300 ease-(--ease-spring)', on && 'translate-x-4 bg-accent-fg')} />
        </button>
    )
}

// a row of choices where exactly one is on. the raised thumb slides from the
// old choice to the new one on a spring, rather than one going dark and
// another lighting up
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
    const id = useId()

    return (
        <div role='radiogroup' className={cn('seg inline-flex max-w-full overflow-x-auto rounded-(--r-control) p-1 [scrollbar-width:none]', className)}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type='button'
                    role='radio'
                    aria-checked={value === option.id}
                    {...(option.hint ? tip(option.hint) : {})}
                    onClick={() => on_change(option.id)}
                    className={cn('relative flex h-7 items-center justify-center gap-1.5 rounded-[max(0.125rem,calc(var(--r-control)-0.25rem))] px-3.5 text-[0.8125rem] transition-colors', value === option.id ? 'text-fg' : 'text-muted hover:text-fg')}
                >
                    {value === option.id && (
                        <motion.span layoutId={`segment-${id}`} transition={spring.snappy} className='seg-thumb btn-fill absolute inset-0 rounded-[max(0.125rem,calc(var(--r-control)-0.25rem))]' />
                    )}
                    <span className='relative flex items-center gap-1.5'>{option.label}</span>
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
            className={cn('grid shrink-0 place-items-center rounded-md transition-[color,scale] active:scale-90', liked ? 'text-accent' : 'text-muted hover:text-fg', className)}
        >
            <HeartIcon size={size} className={liked ? 'fill-current' : ''} />
        </button>
    )
}

// what a listing says when there is nothing in it: a line of what is missing
// and a line of how to fill it, on the page itself rather than in a box
export function Empty({ icon, title, children, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
    return (
        <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
            {icon && <div className='mb-3 text-muted'>{icon}</div>}
            <p className='text-[0.875rem] text-fg'>{title}</p>
            {children && <div className='mt-1 max-w-sm text-[0.8125rem] text-muted'>{children}</div>}
        </div>
    )
}
