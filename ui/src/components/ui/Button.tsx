import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from './icons'
import { cn } from '../../lib/cn'
import { Spin } from './Spin'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

/*
 * Buttons are pills pressed into the surface they sit on, not boxes laid on
 * top of it: primary is the one thing to do on a screen, in the accent;
 * secondary is a tint of the text colour over whatever is under it, so it
 * takes the colour of the panel, the light and the glass rather than
 * covering them. No outlines - a hairline round a button is what made them
 * read as drawn over the page. A hover is a step in tint, a press a small step
 * down in size.
 */
const soft = 'bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:bg-[color-mix(in_oklab,var(--fg)_13%,transparent)]'

// `btn`, `btn-fill` and `btn-accent` are what liquid glass hangs on (index.css):
// a filled button turns to a piece of glass, a bare one only under the pointer
const variants: Record<Variant, string> = {
    primary: 'btn btn-fill btn-accent bg-accent text-accent-fg hover:bg-[color-mix(in_oklab,var(--accent)_86%,var(--fg))]',
    secondary: `btn btn-fill ${soft} text-fg`,
    ghost: 'btn text-fg-2 hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:text-fg',
    danger: 'btn btn-fill bg-danger/10 text-danger hover:bg-danger/15',
}

const sizes: Record<Size, string> = {
    sm: 'h-8 gap-1.5 rounded-(--r-button) px-3.5 text-[0.8125rem]',
    md: 'h-9 gap-2 rounded-(--r-button) px-4 text-[0.875rem]',
    lg: 'h-11 gap-2 rounded-(--r-button) px-5 text-[0.875rem]',
}

const button_class = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
    cn(
        'inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
        'transition-[color,background-color,opacity,scale] active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-40',
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
            {loading ? <Spin><LoaderCircle size={16} /></Spin> : icon}
            {children}
        </button>
    )
}

const icon_variants = {
    soft: `btn btn-fill ${soft} text-fg-2 hover:text-fg`,
    // kept for callers that ask for it: the same soft fill, no ring
    outline: `btn btn-fill ${soft} text-fg-2 hover:text-fg`,
    plain: 'btn text-muted hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)] hover:text-fg',
    // over a picture, the same in both themes
    overlay: 'bg-black/60 text-white hover:bg-black/75',
    on: 'btn text-accent hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]',
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof icon_variants
    size?: 'sm' | 'md' | 'lg'
}

const icon_sizes = { sm: 'size-8 rounded-(--r-button)', md: 'size-9 rounded-(--r-button)', lg: 'size-11 rounded-(--r-button)' }

// icon only, so it always carries a label - tip() gives it one
export function IconButton({ variant = 'plain', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                'inline-flex shrink-0 items-center justify-center',
                'transition-[color,background-color,opacity,scale] active:scale-95 disabled:pointer-events-none disabled:opacity-35',
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
