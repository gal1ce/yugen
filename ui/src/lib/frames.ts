import { bridge } from './bridge'

/*
 * Where frames come from.
 *
 * Normally that is the engine's own requestAnimationFrame. The Qt build turns
 * chromium's frame limit off - without that it is pinned to 60 fps whatever
 * the monitor - and with the limit off, rAF fires as fast as frames are taken,
 * thousands a second. So there the page keeps its own beat instead: a timer
 * locked to the display's refresh rate (asked of Qt through get_refresh_rate),
 * and chromium only draws when that beat has changed something.
 *
 * Everything that animates on its own asks for frames through here, never
 * through rAF directly.
 */
let interval = 0
let next_target = 0
let timer: ReturnType<typeof setTimeout> | undefined
let queue = new Map<number, (now: number) => void>()
let next_id = 1

function beat() {
    timer = undefined

    const now = performance.now()
    const due = queue
    queue = new Map()

    for (const callback of due.values()) callback(now)

    if (queue.size) schedule()
}

function schedule() {
    if (timer !== undefined) return

    const now = performance.now()

    // drift-free: each beat is due one interval after the last one was, and a
    // beat that came very late starts the count again rather than racing to catch up
    next_target += interval
    if (next_target < now - interval) next_target = now + interval

    timer = setTimeout(beat, Math.max(0, next_target - now))
}

export function next_frame(callback: (now: number) => void): number {
    if (!interval) return -requestAnimationFrame(callback)

    const id = next_id++
    queue.set(id, callback)
    schedule()

    return id
}

export function cancel_frame(id: number) {
    if (id < 0) cancelAnimationFrame(-id)
    else queue.delete(id)
}

// the beat the page keeps, when it keeps its own (0: the engine's)
export const paced = () => interval > 0

export async function init_frames() {
    const ask = (() => {
        try {
            return bridge().get_refresh_rate
        } catch {
            return undefined
        }
    })()

    if (typeof ask !== 'function') return

    try {
        const hz = await ask()

        if (hz > 0) {
            interval = 1000 / hz
            next_target = performance.now()
            // css that would otherwise animate at the unlimited rate stands down
            document.documentElement.classList.add('paced')
        }
    } catch {
        // an old backend: the engine's own frames, as before
    }
}
