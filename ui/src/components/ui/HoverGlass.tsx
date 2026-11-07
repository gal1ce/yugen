import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'
import { cancel_frame, next_frame } from '../../lib/frames'
import { paced } from '../../lib/motion'

/*
 * The hover of a stack of rows, as one piece of glass that moves between them.
 *
 * It lives in the list, under the rows (the list is positioned; this is its
 * first child), and goes to whichever row - `data-hover`, however deep in the
 * list - the pointer is on.
 * It comes out of the row that is open (`aria-current`) the way the page's
 * bar comes off the top of the page: it peels away from it, its leading edge
 * running ahead to the new row and its trailing edge following later and
 * looser, so on the way it is drawn out long and then pulls itself in. Back
 * on the open row, or with the pointer gone, it runs back into the open row
 * and is gone.
 *
 * The two edges are two springs and the opacity a third, stepped from the
 * page's beat while any of them still moves and not at all once they rest.
 * With animations off, or the system asking for less motion, it is simply
 * on the row the pointer is on.
 */
const LEAD = 34
const TRAIL = 15
const TRAIL_ZETA = 0.72
const FADE = 22

type Spring = { x: number; v: number; to: number }

const spring = (x: number): Spring => ({ x, v: 0, to: x })

function step(s: Spring, omega: number, zeta: number, h: number) {
    s.v += (omega * omega * (s.to - s.x) - 2 * zeta * omega * s.v) * h
    s.x += s.v * h
}

const resting = (s: Spring, near: number) => Math.abs(s.to - s.x) < near && Math.abs(s.v) < near * 10

export function HoverGlass({ className }: { className?: string }) {
    const glass = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const node = glass.current
        const list = node?.parentElement
        if (!node || !list) return

        const less = window.matchMedia('(prefers-reduced-motion: reduce)')
        const top = spring(0)
        const bottom = spring(0)
        const shown = spring(0)
        let down = true
        let frame = 0
        let last = 0
        let over: HTMLElement | null = null

        const still = () => less.matches || document.documentElement.dataset.pace === 'off'
        const open = () => list.querySelector<HTMLElement>('[data-hover][aria-current]')
        // a row's place in the list, measured on screen and taken back out of
        // any scale on the list (a menu grows in on open), so a row inside a
        // scroller of its own is found where it is now
        const span = (row: HTMLElement) => {
            const box = list.getBoundingClientRect()
            const at = row.getBoundingClientRect()
            const scale = list.offsetWidth ? box.width / list.offsetWidth : 1
            const top = (at.top - box.top) / scale - list.clientTop
            const left = (at.left - box.left) / scale - list.clientLeft

            return { top, bottom: top + at.height / scale, left, width: at.width / scale }
        }

        const paint = () => {
            const height = Math.max(bottom.x - top.x, 0)
            node.style.transform = `translate3d(0, ${top.x.toFixed(2)}px, 0)`
            node.style.height = `${height.toFixed(2)}px`
            node.style.opacity = `${Math.min(Math.max(shown.x, 0), 1).toFixed(3)}`
        }

        const tick = (now: number) => {
            frame = 0
            const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
            last = now
            const pace = paced(1)

            let left = dt
            while (left > 0) {
                const h = Math.min(left, 1 / 240)
                left -= h
                // the edge on the side it is going leads; the other is pulled after it
                step(down ? bottom : top, LEAD / pace, 0.9, h)
                step(down ? top : bottom, TRAIL / pace, TRAIL_ZETA, h)
                step(shown, FADE / pace, 1, h)
            }

            if (resting(top, 0.2) && resting(bottom, 0.2) && resting(shown, 0.004)) {
                for (const s of [top, bottom, shown]) {
                    s.x = s.to
                    s.v = 0
                }
                last = 0
                paint()
                return
            }

            paint()
            frame = next_frame(tick)
        }

        const run = () => {
            if (still()) {
                cancel_frame(frame)
                frame = 0
                for (const s of [top, bottom, shown]) {
                    s.x = s.to
                    s.v = 0
                }
                paint()
                return
            }

            if (!frame) {
                last = 0
                frame = next_frame(tick)
            }
        }

        // where it is going: a row, lit; or the open row, where it goes out
        const go = (row: HTMLElement | null) => {
            const here = open()
            const target = row && row !== here ? row : here
            const visible = shown.x > 0.02 || shown.to > 0

            // out of nothing it starts on the open row and peels away from it;
            // with no open row it simply comes up where it is going
            if (!visible) {
                const from = here ?? target
                if (from) {
                    const at = span(from)
                    top.x = top.to = at.top
                    bottom.x = bottom.to = at.bottom
                    top.v = bottom.v = 0
                }
            }

            if (target) {
                const at = span(target)
                node.style.left = `${at.left}px`
                node.style.width = `${at.width}px`
                down = at.top + at.bottom > top.to + bottom.to
                top.to = at.top
                bottom.to = at.bottom
            }

            shown.to = row && row !== here ? 1 : 0
            run()
        }

        const on_over = (event: PointerEvent) => {
            // a finger has no hover: a tap would leave the glass on its row
            if (event.pointerType === 'touch') return
            const row = (event.target as Element).closest<HTMLElement>('[data-hover]')
            if (!row || !list.contains(row) || row === over) return
            over = row
            go(row)
        }

        const on_leave = () => {
            over = null
            go(null)
        }

        // a click opens the row under the pointer: once it is marked open, the
        // glass goes into it
        const on_click = () => {
            next_frame(() => next_frame(() => go(over)))
        }

        // a scroller inside the list moves the rows from under it
        const on_scroll = () => over && go(over)

        list.addEventListener('pointerover', on_over)
        list.addEventListener('pointerleave', on_leave)
        list.addEventListener('click', on_click)
        list.addEventListener('scroll', on_scroll, { capture: true, passive: true })

        return () => {
            list.removeEventListener('pointerover', on_over)
            list.removeEventListener('pointerleave', on_leave)
            list.removeEventListener('click', on_click)
            list.removeEventListener('scroll', on_scroll, { capture: true })
            cancel_frame(frame)
        }
    }, [])

    return <div ref={glass} aria-hidden className={cn('hover-glass pointer-events-none absolute top-0 left-0 opacity-0 will-change-transform', className)} />
}
