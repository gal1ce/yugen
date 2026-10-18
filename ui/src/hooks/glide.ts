import { useEffect } from 'react'
import { cancel_frame, next_frame } from '../lib/frames'

/*
 * A row that runs sideways has no vertical scroll of its own, so a wheel over it
 * would move the page underneath instead - and the row it is pointing at would
 * sit there. This turns the wheel a quarter turn for as long as the pointer is
 * over one. The listener has to be native and non-passive: react's own wheel
 * handler cannot cancel the page's scroll.
 */
export const sideways = (box: HTMLElement | null) => {
    if (!box) return

    // a notch of the wheel used to be written straight onto scrollLeft, which is
    // the row jumping a hundred-odd pixels between two frames. the notches are
    // collected into a target instead and the row is eased towards it, so a
    // flick of the wheel reads as the shelf being pushed rather than cut.
    let target = box.scrollLeft
    let pos = box.scrollLeft
    let frame = 0
    let last = 0

    const glide = (now: number) => {
        const step = last ? Math.min(now - last, 64) : 16
        last = now

        // its own position, not scrollLeft read back: see the note on the
        // vertical glide for what a rounded reading does to the last pixel
        pos += (target - pos) * (1 - Math.exp(-step / 90))

        if (Math.abs(target - pos) < 0.5) {
            pos = target
            box.scrollLeft = pos
            frame = 0

            return
        }

        box.scrollLeft = pos
        frame = next_frame(glide)
    }

    const on_wheel = (event: WheelEvent) => {
        // a trackpad already swiping sideways is left alone
        if (box.scrollWidth <= box.clientWidth) return
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

        event.preventDefault()

        if (!frame) pos = box.scrollLeft

        // where it is actually sitting, unless a glide is already on its way to
        // somewhere - then that somewhere is what the notch adds to
        const from = frame ? target : pos
        const limit = box.scrollWidth - box.clientWidth

        target = Math.min(Math.max(from + event.deltaY, 0), limit)

        if (!frame) {
            last = 0
            frame = next_frame(glide)
        }
    }

    box.addEventListener('wheel', on_wheel, { passive: false })

    return () => {
        box.removeEventListener('wheel', on_wheel)
        if (frame) cancel_frame(frame)
    }
}

/*
 * Every scroll in this app happens inside a panel: index.css pins html and body
 * at one screen, so nothing ever scrolls the page. That is the case a mouse
 * wheel is worst at - a notch is written straight onto scrollTop and the panel
 * steps instead of moving. This catches the notches and eases the panel towards
 * where they add up to, which is the same trick the sideways shelves use.
 *
 * A trackpad is left alone. It already arrives as a fine stream with the
 * platform's own momentum behind it, and anything under a notch in size is
 * taken to be one. Calling preventDefault is also what keeps this from stacking
 * on top of whatever smoothing the engine does: cancelling the event takes the
 * native scroll out of it entirely, so there is only ever one animation.
 */
const NOTCH = 40
const LINE = 40
// the spring's natural frequency in rad/s: a notch is done in about a fifth of
// a second, which is close to how fast a hand can turn the wheel
const SPRING = 17

export function useGlideScroll() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

        let box: HTMLElement | null = null
        let target = 0
        let pos = 0
        let vel = 0
        let frame = 0
        let last = 0

        // Easing towards a target the plain way - take a fixed fraction of what
        // is left each frame - spends most of the distance in the first few
        // frames and then crawls the last handful of pixels, and every notch
        // starts again from a standstill. Turning the wheel steadily then reads
        // as a row of separate lurches rather than one movement.
        //
        // This is a critically damped spring instead: it has a speed, so a notch
        // arriving while the panel is already moving adds to that speed rather
        // than restarting the curve, and the whole run of notches comes out as
        // one continuous glide that settles without overshooting.
        const advance = (step: number) => {
            // fixed sub-steps: at one integration per frame a spring this stiff
            // is close enough to the edge of stability to wobble on a long frame
            let left = step

            while (left > 0) {
                const dt = Math.min(left, 8) / 1000
                left -= 8

                vel += (SPRING * SPRING * (target - pos) - 2 * SPRING * vel) * dt
                pos += vel * dt
            }
        }

        const glide = (now: number) => {
            if (!box) {
                frame = 0

                return
            }

            const step = last ? Math.min(now - last, 64) : 16
            last = now

            advance(step)

            if (Math.abs(target - pos) < 0.4 && Math.abs(vel) < 14) {
                pos = target
                vel = 0
                box.scrollTop = pos
                frame = 0

                return
            }

            box.scrollTop = pos
            frame = next_frame(glide)
        }

        // the panel the pointer is actually over, which is not always the one
        // the event was aimed at
        const scroller = (node: EventTarget | null) => {
            let el = node instanceof Element ? node : null

            while (el && el !== document.body) {
                if (el.scrollHeight - el.clientHeight > 1) {
                    const flow = getComputedStyle(el).overflowY

                    if (flow === 'auto' || flow === 'scroll') return el as HTMLElement
                }

                el = el.parentElement
            }

            return null
        }

        const on_wheel = (event: WheelEvent) => {
            // a sideways shelf has already claimed it, or the wheel is a zoom
            if (event.defaultPrevented || event.ctrlKey) return
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

            const found = scroller(event.target)
            if (!found) return

            /*
             * While this panel is gliding, every notch over it is the glide's,
             * whatever its size and wherever it lands. One handed to the engine
             * mid-glide is scrolled there and then on the compositor - straight
             * to where the notch ends - and the glide's next frame writes the
             * panel back to where the spring has got to. For one frame the page
             * stood somewhere else and jumped back: the ghost of the page a
             * little above or below itself, most often when the wheel is pushed
             * on at the bottom while the spring is still settling there.
             */
            const gliding = frame !== 0 && box === found

            if (event.deltaMode === 0 && Math.abs(event.deltaY) < NOTCH && !gliding) return

            // whatever the platform counts in, in pixels
            const push =
                event.deltaMode === 1
                    ? event.deltaY * LINE
                    : event.deltaMode === 2
                      ? event.deltaY * found.clientHeight * 0.9
                      : event.deltaY

            if (box !== found) {
                if (frame) cancel_frame(frame)

                box = found
                frame = 0
            }

            // between notches the panel may have been moved by something else -
            // a dragged scrollbar, a keyboard - so the glide re-reads where it
            // really is whenever it is not already on its way somewhere. a run
            // that is still going keeps its speed; that is the point of it.
            if (!frame) {
                pos = found.scrollTop
                vel = 0
            }

            const from = frame ? target : pos
            const next = Math.min(Math.max(from + push, 0), found.scrollHeight - found.clientHeight)

            // at either end of its travel the wheel is handed back rather than
            // swallowed, so the gesture still belongs to whatever is behind it -
            // but not while the glide is still on its way there (see above)
            if (next === from) {
                if (gliding) event.preventDefault()
                return
            }

            event.preventDefault()
            target = next

            if (!frame) {
                last = 0
                frame = next_frame(glide)
            }
        }

        window.addEventListener('wheel', on_wheel, { passive: false })

        return () => {
            window.removeEventListener('wheel', on_wheel)
            if (frame) cancel_frame(frame)
        }
    }, [])
}

/*
 * A panel moving under a still pointer drags card after card through the hover:
 * each one lifts, glows and zooms as it passes and drops again behind it, and
 * the whole page seems to redraw itself as it scrolls. For as long as a panel
 * is moving, and a moment after, what is inside it stops taking the pointer
 * (index.css, [data-scrolling]). The mark goes on the panel that scrolled, so
 * the rest of the window answers as usual.
 */
const SETTLE = 140

export function useScrollQuiet() {
    useEffect(() => {
        const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

        const on_scroll = (event: Event) => {
            const box = event.target
            if (!(box instanceof HTMLElement)) return

            const held = timers.get(box)
            if (held) clearTimeout(held)
            else box.dataset.scrolling = ''

            timers.set(
                box,
                setTimeout(() => {
                    delete box.dataset.scrolling
                    timers.delete(box)
                }, SETTLE),
            )
        }

        document.addEventListener('scroll', on_scroll, { capture: true, passive: true })

        return () => {
            document.removeEventListener('scroll', on_scroll, { capture: true })
            for (const [box, timer] of timers) {
                clearTimeout(timer)
                delete box.dataset.scrolling
            }
        }
    }, [])
}
