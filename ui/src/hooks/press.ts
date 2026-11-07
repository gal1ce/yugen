import type { PointerEvent, MouseEvent } from 'react'

/*
 * A press a scroll cannot swallow. Android's WebView takes a tap that lands
 * while the page is still flung as the end of the fling and sends no click
 * for it (seen on the phone: pointerdown and pointerup, and nothing after).
 * The tab bar and the way back are not part of what scrolls, and a phone's
 * own apps answer them however the page under them is moving - so these act
 * on the lift of a finger that stayed put. The click that follows an ordinary
 * tap comes after the press has already changed the screen, and lands on
 * whatever is now under the finger (the next screen's title, seen on the
 * phone), so it is caught on its way down and let go wherever it lands. A
 * click with no finger before it (a key) still acts.
 */
const SLOP = 10
const ECHO = 600

let start: { id: number; x: number; y: number } | null = null
let acted = -Infinity

function swallow(e: Event) {
    if (e.timeStamp - acted >= ECHO) return
    e.stopPropagation()
    e.preventDefault()
}

export function press(act: () => void) {
    return {
        onPointerDown: (e: PointerEvent) => {
            start = e.pointerType === 'mouse' && e.button !== 0 ? null : { id: e.pointerId, x: e.clientX, y: e.clientY }
        },
        onPointerCancel: () => {
            start = null
        },
        onPointerUp: (e: PointerEvent) => {
            const from = start
            start = null
            if (!from || from.id !== e.pointerId || Math.abs(e.clientX - from.x) > SLOP || Math.abs(e.clientY - from.y) > SLOP) return
            acted = e.timeStamp
            window.addEventListener('click', swallow, { capture: true, once: true })
            setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), ECHO)
            act()
        },
        onClick: (e: MouseEvent) => {
            if (e.timeStamp - acted < ECHO) return
            act()
        },
    }
}
