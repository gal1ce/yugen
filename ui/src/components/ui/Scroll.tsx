import { useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from 'react'
import { cn } from '../../lib/cn'
import { register } from '../../lib/smooth'

/*
 * Every panel that scrolls is one of these: the box that scrolls, with the
 * eased wheel (lib/smooth) on it, and one child inside that holds everything.
 * The child is what rows are measured against (`inner` takes the padding),
 * which is why it is positioned.
 */
export function Scroll({
    className,
    inner,
    style,
    box,
    children,
}: {
    className?: string
    inner?: string
    style?: CSSProperties
    // the box, for whoever moves it on purpose (glide_to)
    box?: Ref<HTMLDivElement>
    children: ReactNode
}) {
    const own = useRef<HTMLDivElement>(null)

    useImperativeHandle(box, () => own.current as HTMLDivElement, [])

    useEffect(() => {
        const node = own.current
        if (node) return register(node)
    }, [])

    return (
        <div
            ref={own}
            style={style}
            // will-change: the box scrolls as one picture, rather than having its
            // contents painted and rastered again for every step of a glide
            className={cn('min-h-0 overflow-y-auto overscroll-contain will-change-scroll', className)}
        >
            <div className={cn('relative', inner)}>{children}</div>
        </div>
    )
}
