import { useEffect, type ReactNode } from 'react'
import { X } from './icons'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
import { tip } from '../../lib/tip'

/*
 * A window over the app. The scrim is a plain dark fill: a blur behind a
 * dialog is one more full-window layer to paint, and the dialog is what is
 * being looked at anyway. Escape and a click on the scrim both close it,
 * unless something inside is busy.
 */
export function Dialog({
    title,
    sub,
    on_close,
    busy,
    className,
    children,
}: {
    title?: ReactNode
    sub?: ReactNode
    on_close: () => void
    busy?: boolean
    className?: string
    children: ReactNode
}) {
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) {
                e.stopPropagation()
                on_close()
            }
        }

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [on_close, busy])

    return (
        <div
            className='fixed inset-0 z-60 grid animate-fade-in place-items-center bg-[var(--scrim)] p-6'
            onClick={busy ? undefined : on_close}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div
                role='dialog'
                className={cn('edge w-full max-w-md animate-pop-in rounded-2xl bg-surface p-6 shadow-soft', className)}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div className='mb-5 flex items-start gap-3'>
                        <div className='min-w-0 flex-1'>
                            <h3 className='text-base font-semibold'>{title}</h3>
                            {sub && <p className='mt-0.5 text-xs text-muted'>{sub}</p>}
                        </div>
                        <IconButton size='sm' {...tip('Close')} disabled={busy} onClick={on_close} className='-mt-1 -mr-2'>
                            <X size={16} />
                        </IconButton>
                    </div>
                )}
                {children}
            </div>
        </div>
    )
}

export const DialogActions = ({ children }: { children: ReactNode }) => (
    <div className='mt-6 flex justify-end gap-2'>{children}</div>
)
