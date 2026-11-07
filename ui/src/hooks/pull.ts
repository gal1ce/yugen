import { useEffect, type RefObject } from 'react'
import { animate, type MotionValue } from 'motion/react'
import { spring } from '../lib/motion'

/*
 * A sheet pulled down by a finger, from anywhere on it - not only its grabber.
 *
 * Done with the touch events themselves rather than a pointer drag: on
 * Android the moment a finger moves up or down the WebView takes the touch for
 * its own scroll and the pointer is cancelled, so a drag set off on the sheet
 * stopped a few pixels in. Here the move is caught first (non-passive), and
 * when it is a pull - downwards, more down than across, and not inside
 * something scrolled away from its top, which keeps its own scroll - the
 * page's scroll is held off and the sheet follows the finger. Let go past
 * `far` of the window, or flicked, it closes; otherwise it springs back.
 */
export function usePull(sheet: RefObject<HTMLElement | null>, y: MotionValue<number>, on_close: () => void, { far = 0.2, enabled = true } = {}) {
    useEffect(() => {
        const node = sheet.current
        if (!node || !enabled) return

        let start: { x: number; y: number; t: number } | null = null
        let pulling = false
        let last = { y: 0, t: 0 }
        let speed = 0

        // whether anything between the finger and the sheet is scrolled down:
        // then a downward move is that box going back up, not a pull
        const scrolled = (from: EventTarget | null) => {
            for (let el = from as HTMLElement | null; el && el !== node; el = el.parentElement) {
                if (el.scrollTop > 0) return true
            }
            return false
        }

        const down = (e: TouchEvent) => {
            if (e.touches.length !== 1 || scrolled(e.target)) return
            const t = e.touches[0]
            start = { x: t.clientX, y: t.clientY, t: e.timeStamp }
            pulling = false
            last = { y: t.clientY, t: e.timeStamp }
            speed = 0
        }

        const move = (e: TouchEvent) => {
            if (!start) return
            const t = e.touches[0]
            const dx = t.clientX - start.x
            const dy = t.clientY - start.y

            if (!pulling) {
                if (Math.hypot(dx, dy) < 8) return
                // up, or sideways: not a pull, and this touch never becomes one
                if (dy <= 0 || Math.abs(dx) > dy) {
                    start = null
                    return
                }
                pulling = true
            }

            e.preventDefault()
            const dt = Math.max(e.timeStamp - last.t, 1)
            speed = (t.clientY - last.y) / dt
            last = { y: t.clientY, t: e.timeStamp }
            y.set(Math.max(dy, 0))
        }

        const up = () => {
            if (!start || !pulling) {
                start = null
                return
            }
            start = null
            pulling = false

            const height = node.offsetHeight || window.innerHeight
            if (y.get() > window.innerHeight * far || speed > 0.6) {
                void animate(y, height, { duration: 0.2, ease: [0.4, 0, 1, 1] }).then(on_close)
            } else void animate(y, 0, spring.snappy)
        }

        node.addEventListener('touchstart', down, { passive: true })
        node.addEventListener('touchmove', move, { passive: false })
        node.addEventListener('touchend', up)
        node.addEventListener('touchcancel', up)

        return () => {
            node.removeEventListener('touchstart', down)
            node.removeEventListener('touchmove', move)
            node.removeEventListener('touchend', up)
            node.removeEventListener('touchcancel', up)
        }
    }, [sheet, y, on_close, far, enabled])
}
