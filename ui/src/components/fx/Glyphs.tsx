import { useEffect, useRef, useState } from 'react'
import { spectrum, step_audio } from '../../lib/audio'
import { workers_draw } from '../../lib/engine'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'
import { ui } from '../../state/ui'
import { create_field, type Field, type FieldMessage, type FieldOptions } from './field'

/*
 * The field behind the pages, after sovel's: small characters in slow bands
 * that drift across. Nothing more happens in it - it is a backdrop, and it
 * answers neither clicks nor the beat.
 *
 * It does listen a little: the bands move faster and burn brighter with the
 * sound.
 *
 * Thousands of characters a frame is real work, so it is not done here when it
 * does not have to be. The canvas is handed to a worker (OffscreenCanvas) and
 * drawn there; this side only sends it the clock and the sound. Where the
 * engine cannot do that, it is drawn on the page at a lower rate instead.
 */
type Host = { post: (message: FieldMessage, transfer?: Transferable[]) => void; field?: Field; worker?: Worker }

// a canvas can be given to a worker once. react may mount this twice (strict
// mode), so the host is kept with the canvas rather than with the effect
const hosts = new WeakMap<HTMLCanvasElement, Host>()

// a worker that could not be loaded - a scheme the engine will not start one
// from, say - is not tried again: the field is drawn on the page from then on
// webkitgtk crashes on a canvas drawn from a worker (see lib/engine), so there
// it is drawn on the page from the start
let workers_broken = !workers_draw

function host_for(canvas: HTMLCanvasElement, options: FieldOptions, width: number, height: number, on_broken: () => void): Host {
    const held = hosts.get(canvas)
    if (held) return held

    let host: Host | null = null

    if (!workers_broken && 'transferControlToOffscreen' in canvas && typeof Worker !== 'undefined') {
        try {
            const worker = new Worker(new URL('./glyphs.worker.ts', import.meta.url), { type: 'module' })

            // the canvas is already the worker's by the time this can fail, so
            // the page needs a fresh one to draw on itself
            worker.addEventListener('error', () => {
                workers_broken = true
                worker.terminate()
                on_broken()
            })

            const offscreen = canvas.transferControlToOffscreen()

            worker.addEventListener('message', (event: MessageEvent<{ mode?: string }>) => {
                if (event.data.mode) canvas.dataset.field = event.data.mode
            })
            worker.postMessage({ kind: 'init', canvas: offscreen, width, height, options } satisfies FieldMessage, [offscreen])
            host = { worker, post: (message, transfer) => worker.postMessage(message, transfer ?? []) }
        } catch {
            host = null
        }
    }

    if (!host) {
        const field = create_field(canvas, options)
        field.resize(width, height)
        canvas.dataset.field = 'page'

        host = {
            field,
            post(message) {
                if (message.kind === 'resize') field.resize(message.width, message.height, message.dpr)
                else if (message.kind === 'recolour') field.recolour(message.base, message.ceiling)
                else if (message.kind === 'frame') field.frame(message.dt, message.level)
            },
        }
    }

    hosts.set(canvas, host)

    return host
}

function colours(theme: string, strength: number) {
    const styles = getComputedStyle(document.documentElement)
    const dark = theme === 'dark' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches)

    return {
        base: styles.getPropertyValue('--muted').trim() || '#888',
        // dark pages take brighter characters than light ones before they get in the way
        ceiling: (dark ? 0.46 : 0.32) * strength,
    }
}

// `fade`: it thins out towards the bottom - done in the drawing rather than
// with a css mask, which over a canvas that changes every frame is one more
// pass for webkit
export function Glyphs(props: { className?: string; strength?: number; fade?: boolean }) {
    // a new canvas element when the worker gave up on the old one
    const [attempt, set_attempt] = useState(0)

    return <Field key={attempt} {...props} on_broken={() => set_attempt((n) => n + 1)} />
}

function Field({ className, strength = 1, fade = false, on_broken }: { className?: string; strength?: number; fade?: boolean; on_broken: () => void }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const host = useRef<Host | null>(null)
    const theme = useStore(ui, (s) => s.theme)
    const motion = useStore(fx, (s) => s.motion)
    const still = motion !== 'full' || reduced()

    // the field itself, once
    useEffect(() => {
        const canvas = ref.current
        if (!canvas) return

        const box = canvas.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        host.current = host_for(canvas, { dpr, fade, ...colours(ui.get().theme, strength) }, box.width, box.height, on_broken)

        const sized = new ResizeObserver(() => {
            const next = canvas.getBoundingClientRect()
            host.current?.post({ kind: 'resize', width: next.width, height: next.height, dpr })
            // a still field has to be drawn again at its new size
            if (fx.get().motion !== 'full') host.current?.post({ kind: 'frame', dt: 0, level: 0 })
        })
        sized.observe(canvas)

        return () => sized.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- made once per canvas; colours follow below
    }, [])

    // the theme changed the page
    useEffect(() => {
        // a beat after the theme: the stylesheet's colours are read once they have changed
        const timer = setTimeout(() => host.current?.post({ kind: 'recolour', ...colours(theme, strength) }), 160)
        return () => clearTimeout(timer)
    }, [theme, strength])

    // the clock
    useEffect(() => {
        if (!host.current) return

        if (still) {
            host.current.post({ kind: 'frame', dt: 0, level: 0 })
            return
        }

        // a worker can keep up with thirty a second; the page itself gets fewer
        const stop = add_painter(
            host.current.worker ? 0 : 30,
            (now, dt) => {
                step_audio(now, dt)

                const level = spectrum.live ? spectrum.level : spectrum.level * 0.4
                host.current?.post({ kind: 'frame', dt, level })
            },
            { page: true },
        )

        return stop
    }, [still])

    return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`} />
}
