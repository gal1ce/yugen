import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from './icons'
import { cn } from '../../lib/cn'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

// primary: the accent lit a little from the top, glowing on hover. secondary: a
// gradient edge that turns to the accent on hover. the slow parts take their
// time, the press is quick
const variants: Record<Variant, string> = {
    primary:
        'bg-accent bg-linear-to-b from-[color-mix(in_oklab,var(--accent)_82%,white)] to-accent text-accent-fg shadow-primary hover:brightness-[1.06]',
    secondary: 'edge edge-hover bg-surface-2 text-fg hover:bg-surface-3',
    ghost: 'text-muted hover:text-fg hover:bg-surface-2',
    danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/20',
}

const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
    md: 'h-9 px-4 text-[0.8rem] gap-2 rounded-xl',
    lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
}

const button_class = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
    cn(
        'inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
        'transition-[color,background-color,box-shadow,filter,opacity,scale] active:scale-[0.97] active:duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
    )

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    size?: Size
    loading?: boolean
    icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
    return (
        <button type={type} disabled={disabled || loading} className={button_class(variant, size, className)} {...rest}>
            {loading ? <LoaderCircle size={15} className='animate-spin' /> : icon}
            {children}
        </button>
    )
}

const icon_variants = {
    outline: 'edge edge-hover text-fg hover:bg-surface-2',
    plain: 'text-muted hover:bg-surface-2 hover:text-fg',
    // over a picture, the same in both themes. a dark backing rather than a
    // blur: one blur per card is what the old ui drowned in
    overlay: 'bg-black/65 text-white hover:bg-black/80',
    on: 'bg-accent/15 text-accent hover:bg-accent/25',
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof icon_variants
    size?: 'sm' | 'md' | 'lg'
}

const icon_sizes = { sm: 'size-7 rounded-lg', md: 'size-9 rounded-full', lg: 'size-11 rounded-full' }

// icon only, so it always carries a label - tip() gives it one
export function IconButton({ variant = 'plain', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                'inline-flex shrink-0 items-center justify-center',
                'transition-[color,background-color,opacity,scale] active:scale-95 active:duration-150 disabled:pointer-events-none disabled:opacity-35',
                icon_sizes[size],
                icon_variants[variant],
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    )
}
