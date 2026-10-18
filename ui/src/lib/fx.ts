import { next_frame } from './frames'
import { save_pref, stored_pref } from './prefs'
import { create_store } from './store'

/*
 * Everything that moves on its own - the field behind the pages, the colours
 * behind the lyrics, the wave of the sound - runs off this one clock. Each
 * painter says how often it wants a frame, and nothing is scheduled at all
 * while there is no painter, the window is hidden, or motion is off.
 */
export type Motion = 'full' | 'calm' | 'off'

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
    { id: 'full', label: 'Full', hint: 'The field drifts, the light moves, the wave follows the sound' },
    { id: 'calm', label: 'Calm', hint: 'Slower light, a still field' },
    { id: 'off', label: 'Off', hint: 'Nothing moves on its own' },
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

function tick(now: number) {
    frame = 0
    if (document.hidden || !painters.size) return

    const covered = fx.get().covered

    for (const painter of painters) {
        if (painter.page && covered) {
            painter.last = 0
            continue
        }

        // 0 is every frame the display gives: on a 165 Hz screen anything less
        // reads as a stutter, so only the costliest layers ask for fewer
        if (painter.fps && now - painter.last < 1000 / painter.fps - 2) continue

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
