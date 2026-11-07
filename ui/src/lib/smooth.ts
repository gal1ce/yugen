import { next_frame } from './frames'
import type { Feel, Scrolling } from './prefs'

/*
 * The wheel, eased. Every panel that scrolls registers its box here.
 *
 * Each notch is caught and added to where the box is heading, and the box
 * closes on that place exponentially: every moment it covers the same share
 * of what is left, so it sets off at once - the first frame after a notch
 * already moves - and slows into place. (A spring from rest, which master
 * used and this tried first, spends its first fifty milliseconds barely
 * moving: measured in the qt build, 2 px of a 120 px notch after a frame,
 * which reads as the wheel not being picked up.) A notch landing mid-glide
 * moves the place further on and the box keeps going, so a wheel turned
 * steadily is one movement. It never overshoots.
 *
 * Why not Lenis any more: Lenis steps with `time - lastTime`, and here it was
 * only stepped while something moved. The first notch after a pause arrived
 * with a lastTime seconds old, so the first step of the glide was seconds
 * long - the box jumped the whole notch in one frame, and only the notches
 * after it eased. That jump was the catch at the start of every scroll. It
 * also needed the box closed to the wheel (overflow hidden) to keep chromium
 * from stepping it natively, which took the keyboard's page-down with it.
 *
 * Three modes (settings, scrolling):
 * - glide: the ease above, gentle or quick;
 * - standard: what a browser does with its own scroll animation - a short
 *   ease of about a sixth of a second per notch;
 * - instant (shown as Native): the engine's own. QtWebEngine ships with its
 *   scroll animation off, which is why this used to step; main.cpp turns it
 *   on (QWebEngineSettings::ScrollAnimatorEnabled).
 *
 * Frames come from the page's beat (lib/frames), and only while a box moves.
 */

// how fast the box closes on its place, per second: the share left after t
// seconds is e^(-rate * t). gentle is 95% there in about 0.23 s, quick in
// 0.15 s, standard - a browser's own scroll animation - in about 0.13 s.
// gentle was 0.3 s, which trailed the wheel enough to read as lag
const RATE: Record<Feel | 'standard', number> = { gentle: 13, quick: 20, standard: 23 }
// a notch in pixels, for wheels that count in lines or pages
const LINE = 40

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let mode: Scrolling = 'glide'
let feel: Feel = 'gentle'

type Glide = { target: number; pos: number; moving: boolean }

const boxes = new Map<HTMLElement, Glide>()

let frame = 0
let last = 0

const rate = () => RATE[mode === 'standard' ? 'standard' : feel]
const travel = (box: HTMLElement) => Math.max(0, box.scrollHeight - box.clientHeight)

// exact for any frame length, so a slow frame is a longer step, never a wobble
function step(glide: Glide, ms: number) {
    glide.pos += (glide.target - glide.pos) * (1 - Math.exp((-rate() * ms) / 1000))
}

function tick(now: number) {
    frame = 0

    // the first frame of a run is one frame long, never the gap since the last run
    const ms = last ? Math.min(now - last, 50) : 1000 / 60
    last = now

    let any = false

    for (const [box, glide] of boxes) {
        if (!glide.moving) continue

        step(glide, ms)

        if (Math.abs(glide.target - glide.pos) < 0.5) {
            glide.pos = glide.target
            glide.moving = false
        } else any = true

        box.scrollTop = glide.pos
    }

    if (any) frame = next_frame(tick)
    else last = 0
}

function wake() {
    if (frame) return

    last = 0
    frame = next_frame(tick)
}

const smoothing = () => mode !== 'instant' && !reduced()

function on_wheel(event: WheelEvent) {
    // a sideways row or a box nested inside this one has taken it already, or
    // the wheel is a zoom
    if (event.defaultPrevented || event.ctrlKey || !smoothing()) return
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

    const box = event.currentTarget as HTMLElement
    const glide = boxes.get(box)
    if (!glide) return

    const push = event.deltaMode === 1 ? event.deltaY * LINE : event.deltaMode === 2 ? event.deltaY * box.clientHeight * 0.9 : event.deltaY

    // between runs something else may have moved the box - the keyboard, a
    // jump to the top - so a glide starts from where the box really is. One
    // still under way keeps its speed; that is the point of it
    if (!glide.moving || Math.abs(box.scrollTop - glide.pos) > 2) glide.pos = glide.target = box.scrollTop

    const next = Math.min(Math.max(glide.target + push, 0), travel(box))

    // at either end the wheel is handed on, so the box behind can take it
    if (next === glide.target && !glide.moving) return

    event.preventDefault()
    glide.target = next
    glide.moving = true
    wake()
}

// a box joins; what comes back takes it out again
export function register(box: HTMLElement) {
    boxes.set(box, { target: box.scrollTop, pos: box.scrollTop, moving: false })
    box.addEventListener('wheel', on_wheel, { passive: false })

    return () => {
        box.removeEventListener('wheel', on_wheel)
        boxes.delete(box)
    }
}

// settings changed: applied to the next notch, nothing to rebuild
export function configure(next: { mode: Scrolling; feel: Feel }) {
    mode = next.mode
    feel = next.feel
}

/*
 * A box to a place: `instant` for a new page going back to its top, eased
 * otherwise - so a lyric line being followed and a wheel turned at the
 * same moment are one movement, not two fighting.
 */
export function glide_to(box: HTMLElement, top: number, { instant = false } = {}) {
    const glide = boxes.get(box)
    const to = Math.min(Math.max(top, 0), travel(box))

    if (!glide || instant || !smoothing()) {
        if (glide) Object.assign(glide, { target: to, pos: to, moving: false })
        box.scrollTop = to
        return
    }

    if (!glide.moving) glide.pos = box.scrollTop

    glide.target = to
    glide.moving = true
    wake()
}
