import { useEffect, useRef, type ReactNode } from 'react'
import { paced } from '../../lib/frames'
import { add_painter } from '../../lib/fx'

/*
 * Something turning while work is under way. A css animation that never ends
 * keeps the compositor ticking, and on the qt build, whose frame limit is off,
 * that is tens of thousands of empty frames a second - so there the turn is
 * written from the page's own beat (lib/frames) instead, and only while `on`.
 */
export function Spin({ on = true, children }: { on?: boolean; children: ReactNode }) {
    const box = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        if (!on || !paced()) return

        return add_painter(0, (now) => {
            if (box.current) box.current.style.transform = `rotate(${(now / 2.8) % 360}deg)`
        })
    }, [on])

    return (
        <span ref={box} className={`inline-grid place-items-center ${on && !paced() ? 'animate-spin' : ''}`}>
            {children}
        </span>
    )
}
