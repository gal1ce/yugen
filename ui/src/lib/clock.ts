import { useEffect, useRef } from 'react'
import { next_frame } from './frames'

/*
 * Where the track is. The backend is polled once a second, far too coarse to
 * move a progress bar or land a lyric on its line, so the gaps are filled in
 * here - and none of it is react state. As state it rendered the whole app
 * every second to move a bar that is painted straight into the dom anyway.
 *
 * The count is anchored to the last poll or seek rather than to its own last
 * guess, so it can never drift further than one poll away from the backend.
 */
type Clock = { at: number; from: number; running: boolean }

let clock: Clock = { at: 0, from: 0, running: false }

// what a drag on the bar is pointing at, while it lasts: the bar shows the
// pointer rather than the track
let held: number | null = null

const painters = new Set<(seconds: number) => void>()
let frame = 0

export const position = (now = performance.now()) =>
    clock.running ? clock.at + (now - clock.from) / 1000 : clock.at

// what is drawn: the drag if there is one, the track otherwise
export const shown_position = (now?: number) => held ?? position(now)

function paint(now?: number) {
    const at = shown_position(now)
    for (const painter of painters) painter(at)
}

function loop(now: number) {
    paint(now)
    frame = clock.running && painters.size ? next_frame(loop) : 0
}

function wake() {
    if (!frame && clock.running && painters.size) frame = next_frame(loop)
    if (!clock.running) paint()
}

export function set_position(seconds: number) {
    clock = { ...clock, at: seconds, from: performance.now() }
    wake()
}

// a pause freezes the count where it had got to and a resume starts it again
// from there, so neither jumps back to the last poll
export function set_running(running: boolean) {
    if (clock.running === running) return

    const now = performance.now()
    clock = { at: position(now), from: now, running }
    wake()
}

export function hold_position(seconds: number | null) {
    held = seconds
    paint()
}

// a painter writes the figure into the dom itself. nothing here is a render,
// and nothing is scheduled at all unless something is playing and on screen
export function useClock(painter: (seconds: number) => void) {
    const current = useRef(painter)

    useEffect(() => {
        current.current = painter
    })

    useEffect(() => {
        const draw = (seconds: number) => current.current(seconds)

        painters.add(draw)
        draw(shown_position())
        wake()

        return () => {
            painters.delete(draw)
        }
    }, [])
}
