import { next_frame } from './frames'
import { save_pref, stored_pref } from './prefs'
import { create_store } from './store'

/*
 * Everything that moves on its own - the nebula behind the pages, the colours
 * behind the lyrics, the wave of the sound - runs off this one clock. Each
 * painter says how often it wants a frame, and nothing is scheduled at all
 * while there is no painter, the window is hidden, or motion is off.
 */
export type Motion = 'full' | 'calm' | 'off'

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
    { id: 'full', label: 'Full', hint: 'What moves on its own - the light, the wave, the nebula - moves' },
    { id: 'calm', label: 'Calm', hint: 'Slower light and a slower nebula' },
    { id: 'off', label: 'Still', hint: 'Nothing moves on its own: the light is a still picture, the wave is gone' },
]

export const fx = create_store<{ motion: Motion; palette: string[]; covered: boolean }>({
    motion: stored_pref('motion', ['full', 'calm', 'off'] as const, 'full'),
    // the cover of what is playing, as a handful of colours, strongest first
    palette: [],
    // something fills the window (the lyrics page): what is under it stops
    covered: false,
})

type Painter = { fps: number; last: number; page: boolean; paint: (now: number, dt: number) => void }

const painters = new Set<Painter>()
let frame = 0

/*
 * A cap on the whole clock, and the beat everything is drawn on under it (0
 * is none). Painters asking for different rates each get their own frames,
 * and out of phase those frames add up: a wave at 90, a nebula at 60 and the
 * bars at 30 had a 120 Hz phone composite nearly every frame - and every
 * composite runs the glass's backdrop filters again. Capped, they all draw
 * together on the same beat, and the window is composited that often only.
 */
let cap = 0
let beat = 0

export function cap_frames(fps: number) {
    cap = fps
}

/*
 * Held while a finger is on the glass and while what it threw is still
 * scrolling. On a phone every frame anything here draws is the whole window
 * composited again; under a finger those frames are the scroll's, so what
 * moves on its own stands still until the page has come to rest, and goes on
 * from where it stood.
 */
let held = false

export function hold_painters(hold: boolean) {
    if (held === hold) return
    held = hold
    if (!hold) {
        // a still stretch is not a jump forward: nothing catches up on release
        for (const painter of painters) painter.last = 0
        wake()
    }
}

function tick(now: number) {
    frame = 0
    if (document.hidden || !painters.size || held) return

    if (cap && now - beat < 1000 / cap - 2) {
        frame = next_frame(tick)
        return
    }
    beat = now

    const covered = fx.get().covered

    for (const painter of painters) {
        if (painter.page && covered) {
            painter.last = 0
            continue
        }

        // 0 is every frame the display gives: on a 165 Hz screen anything less
        // reads as a stutter, so only the costliest layers ask for fewer
        // under a cap, the beat decides: a painter wanting more than it is drawn on every beat
        const want = cap ? Math.min(painter.fps || cap, cap) : painter.fps
        if (want && now - painter.last < 1000 / want - 2) continue

        const dt = painter.last ? Math.min(now - painter.last, 100) / 1000 : 1 / (painter.fps || 60)
        painter.last = now
        painter.paint(now, dt)
    }

    frame = next_frame(tick)
}

const wake = () => {
    if (!frame && painters.size && !document.hidden) frame = next_frame(tick)
}

document.addEventListener('visibilitychange', wake)

// `page`: it is drawn on a page, and has nothing to do while something covers it
export function add_painter(fps: number, paint: (now: number, dt: number) => void, { page = false } = {}) {
    const painter = { fps, last: 0, page, paint }

    painters.add(painter)
    wake()

    return () => {
        painters.delete(painter)
    }
}

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function set_motion(motion: Motion) {
    fx.set({ motion })
    save_pref('motion', motion)
}
