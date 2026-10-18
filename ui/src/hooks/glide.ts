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
    // what was written last: a difference is the row moved by something else -
    // a trackpad swiping it natively - and is taken on rather than undone
    let written = pos

    const glide = (now: number) => {
        const moved = box.scrollLeft - written

        if (Math.abs(moved) > 0.5) {
            pos += moved
            target = Math.min(Math.max(target + moved, 0), box.scrollWidth - box.clientWidth)
        }

        const step = last ? Math.min(now - last, 64) : 16
        last = now

        // its own position, not scrollLeft read back: see the note on the
        // vertical glide for what a rounded reading does to the last pixel
        pos += (target - pos) * (1 - Math.exp(-step / 90))

        if (Math.abs(target - pos) < 0.5) {
            pos = target
            box.scrollLeft = pos
            written = box.scrollLeft
            frame = 0

            return
        }

        box.scrollLeft = pos
        written = box.scrollLeft
        frame = next_frame(glide)
    }

    const on_wheel = (event: WheelEvent) => {
        // a trackpad already swiping sideways is left alone
        if (box.scrollWidth <= box.clientWidth) return
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

        event.preventDefault()

        if (!frame) {
            pos = box.scrollLeft
            written = pos
        }

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

/*
 * One panel glides at a time, and while it does this is the only thing that
 * writes its scrollTop. Everything that moves a panel on purpose - the wheel,
 * the lyrics following the line being sung, a new page going back to its top -
 * comes through here. Two writers on one panel is what the page "ghost" was:
 * one frame drawn where the other one put it, the next where this one did.
 *
 * Moves nothing here asked for - the engine anchoring the view when something
 * above it changes height, a focused element brought into view - are not
 * fought either. Each frame the panel's position is checked against what was
 * written last, and a difference is taken on as where the panel now is: the
 * glide carries on from there, the same distance from its target.
 */
const vertical = { box: null as HTMLElement | null, target: 0, pos: 0, vel: 0, frame: 0, last: 0, written: 0 }

const limit_of = (box: HTMLElement) => Math.max(0, box.scrollHeight - box.clientHeight)

// Easing towards a target the plain way - take a fixed fraction of what is left
// each frame - spends most of the distance in the first few frames and then
// crawls the last handful of pixels, and every notch starts again from a
// standstill. Turning the wheel steadily then reads as a row of separate
// lurches rather than one movement.
//
// This is a critically damped spring instead: it has a speed, so a notch
// arriving while the panel is already moving adds to that speed rather than
// restarting the curve, and the whole run of notches comes out as one
// continuous glide that settles without overshooting.
function advance(step: number) {
    // fixed sub-steps: at one integration per frame a spring this stiff is
    // close enough to the edge of stability to wobble on a long frame
    let left = step

    while (left > 0) {
        const dt = Math.min(left, 8) / 1000
        left -= 8

        vertical.vel += (SPRING * SPRING * (vertical.target - vertical.pos) - 2 * SPRING * vertical.vel) * dt
        vertical.pos += vertical.vel * dt
    }
}

function write(box: HTMLElement) {
    box.scrollTop = vertical.pos
    // read back rather than assumed: the engine rounds and clamps what it is given
    vertical.written = box.scrollTop
}

function tick(now: number) {
    const box = vertical.box

    if (!box || !box.isConnected) {
        vertical.frame = 0

        return
    }

    const moved = box.scrollTop - vertical.written

    if (Math.abs(moved) > 0.5) {
        vertical.pos += moved
        vertical.target = Math.min(Math.max(vertical.target + moved, 0), limit_of(box))
    }

    const step = vertical.last ? Math.min(now - vertical.last, 64) : 16
    vertical.last = now

    advance(step)

    if (Math.abs(vertical.target - vertical.pos) < 0.4 && Math.abs(vertical.vel) < 14) {
        vertical.pos = vertical.target
        vertical.vel = 0
        write(box)
        vertical.frame = 0

        return
    }

    write(box)
    vertical.frame = next_frame(tick)
}

// whatever is gliding stops where it is
export function halt_glide() {
    if (vertical.frame) cancel_frame(vertical.frame)

    vertical.frame = 0
    vertical.vel = 0
}

const gliding = (box: HTMLElement) => vertical.frame !== 0 && vertical.box === box

// the glide moves to `box`; one already under way there keeps its speed
function take(box: HTMLElement) {
    if (vertical.box !== box) {
        halt_glide()
        vertical.box = box
    }

    // between glides the panel may have been moved by anything - a dragged
    // scrollbar, a keyboard - so it starts from where it really is
    if (!vertical.frame) {
        vertical.pos = box.scrollTop
        vertical.written = vertical.pos
        vertical.vel = 0
    }
}

function run() {
    if (vertical.frame) return

    vertical.last = 0
    vertical.frame = next_frame(tick)
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/*
 * A panel to a place: `instant` for a new page going back to its top, eased
 * otherwise. Whatever was gliding there is taken over rather than left running
 * against it.
 */
export function glide_to(box: HTMLElement, top: number, { instant = false } = {}) {
    const to = Math.min(Math.max(top, 0), limit_of(box))

    if (instant || reduced()) {
        if (vertical.box === box) halt_glide()
        box.scrollTop = to

        return
    }

    take(box)
    vertical.target = to
    run()
}

// keys the engine scrolls a panel with: its own animation is let through whole
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export function useGlideScroll() {
    useEffect(() => {
        if (reduced()) return

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

            // while this panel glides every notch over it is the glide's, whatever
            // its size and wherever it lands: one handed to the engine mid-glide is
            // scrolled there on the compositor and written back over next frame
            const busy = gliding(found)

            if (event.deltaMode === 0 && Math.abs(event.deltaY) < NOTCH && !busy) return

            // whatever the platform counts in, in pixels
            const push =
                event.deltaMode === 1
                    ? event.deltaY * LINE
                    : event.deltaMode === 2
                      ? event.deltaY * found.clientHeight * 0.9
                      : event.deltaY

            take(found)

            // a run that is still going adds to where it was headed
            const from = busy ? vertical.target : vertical.pos
            const next = Math.min(Math.max(from + push, 0), limit_of(found))

            // at either end of its travel the wheel is handed back rather than
            // swallowed, so the gesture still belongs to whatever is behind it -
            // but not while the glide is still on its way there
            if (next === from) {
                if (busy) event.preventDefault()
                return
            }

            event.preventDefault()
            vertical.target = next
            run()
        }

        // the engine's own keyboard scrolling, left to run on its own
        const on_key = (event: KeyboardEvent) => {
            if (!SCROLL_KEYS.has(event.key)) return
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return

            halt_glide()
        }

        window.addEventListener('wheel', on_wheel, { passive: false })
        window.addEventListener('keydown', on_key, true)

        return () => {
            window.removeEventListener('wheel', on_wheel)
            window.removeEventListener('keydown', on_key, true)
            halt_glide()
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
