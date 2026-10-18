import { useEffect, useRef } from 'react'
import { BANDS, spectrum, step_audio } from '../../lib/audio'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'
import { player } from '../../state/player'

/*
 * The sound as a wave rather than as cava's row of bars, after serpantinum's
 * continuous visualiser: one solid shape, the low end in the middle and
 * mirrored out to both edges, standing on the floor of its box.
 *
 * What makes it read as one surface rather than a jittery line is all in the
 * levels, not the drawing: a quiet band is gated to nothing, each point rises
 * quickly and settles slowly, neighbours are blended into each other, and the
 * ends are eased down to the floor so the shape comes in from nothing.
 *
 * Without the backend's samples the bands only breathe (lib/audio), and the
 * wave is drawn at half height so it never pretends to be listening.
 */
type Props = {
    className?: string
    // how much of the box a full-scale band may take
    gain?: number
    // grow both ways from the middle of the box instead of up from the floor
    mirror?: boolean
    fps?: number
    // drawn on the lyrics page, so it keeps going while that covers the rest
    overlay?: boolean
}

const POINTS = 64
// how the points read the bands: past 1 the low end gets more of the width
const CURVE = 1.25
// below this a band is silence; above it, lifted a touch so the quiet parts stay low
const THRESHOLD = 0.03
const GAMMA = 1.15
// how far a point moves towards its band per 16 ms, up and down
const RISE = 0.25
const FALL = 0.12

// where every point reads the bands, mirrored about the middle
const SOURCE = Array.from({ length: POINTS }, (_, i) => {
    const half = (POINTS - 1) / 2
    const at = (Math.abs(i - half) / half) ** CURVE * (BANDS - 1)
    const low = Math.floor(at)

    return { low, high: Math.min(BANDS - 1, low + 1), t: at - low }
})

// the ends ease down to the floor
const EDGE = Float32Array.from({ length: POINTS }, (_, i) => {
    const e = Math.min(1, Math.sin((i / (POINTS - 1)) * Math.PI) * 2)
    return e * e * (3 - 2 * e)
})

function sample(bands: Float32Array, raw: Float32Array, out: Float32Array) {
    for (let i = 0; i < POINTS; i++) {
        const { low, high, t } = SOURCE[i]
        const value = bands[low] + (bands[high] - bands[low]) * t

        raw[i] = value < THRESHOLD ? 0 : Math.min(1, ((value - THRESHOLD) / (1 - THRESHOLD)) ** GAMMA)
    }

    // a light blur between neighbours, then the ends
    for (let i = 0; i < POINTS; i++) {
        const prev = raw[i > 0 ? i - 1 : i]
        const next = raw[i < POINTS - 1 ? i + 1 : i]
        out[i] = (prev * 0.25 + raw[i] * 0.5 + next * 0.25) * EDGE[i]
    }
}

export function Wave({ className, gain = 1, mirror = false, fps = 0, overlay = false }: Props) {
    const ref = useRef<HTMLCanvasElement>(null)
    const motion = useStore(fx, (s) => s.motion)
    const palette = useStore(fx, (s) => s.palette)

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx || motion === 'off' || reduced()) return

        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        let width = 0
        let height = 0
        let accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6bb5'

        const resize = () => {
            const box = canvas.getBoundingClientRect()
            width = box.width
            height = box.height
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
        }

        resize()

        const sized = new ResizeObserver(resize)
        sized.observe(canvas)

        // the accent follows the cover, a beat after the palette changes
        const recolour = setTimeout(() => {
            accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent
        }, 120)

        const raw = new Float32Array(POINTS)
        const target = new Float32Array(POINTS)
        const shown = new Float32Array(POINTS)
        // an empty canvas is left alone: clearing it again is still a change,
        // and a change is a frame
        let blank = false

        // half of the shape, as a path: up from the floor (or the middle), through
        // the midpoints between points so it has no corners, straight at the ends
        const trace = (scale: number, base: number, dir: 1 | -1) => {
            const step = width / (POINTS - 1)
            const y = (i: number) => base - dir * shown[i] * scale

            ctx.moveTo(0, base)
            ctx.lineTo(0, y(0))

            for (let i = 1; i < POINTS; i++) {
                ctx.quadraticCurveTo((i - 1) * step, y(i - 1), (i - 0.5) * step, (y(i - 1) + y(i)) / 2)
            }

            ctx.lineTo(width, y(POINTS - 1))
            ctx.lineTo(width, base)
        }

        const draw = (now: number, dt: number) => {
            step_audio(now, dt)

            const { current, paused } = player.get()
            const quiet = !current || paused

            if (quiet) target.fill(0)
            else sample(spectrum.bands, raw, target)

            // up quickly, down slowly, the same at any frame rate
            const frames = dt / 0.016
            const rise = 1 - (1 - RISE) ** frames
            const fall = 1 - (1 - FALL) ** frames
            let moving = false

            for (let i = 0; i < POINTS; i++) {
                const gap = target[i] - shown[i]
                if (Math.abs(gap) < 0.001) shown[i] = target[i]
                else {
                    shown[i] += gap * (gap > 0 ? rise : fall)
                    moving = true
                }
            }

            if (!moving && quiet) {
                if (!blank) {
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                    ctx.clearRect(0, 0, width, height)
                    blank = true
                }
                return
            }

            blank = false
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, width, height)

            const room = (mirror ? height / 2 : height) * 0.92
            const scale = room * gain * (spectrum.live ? 1 : 0.5)

            ctx.fillStyle = accent
            ctx.beginPath()
            trace(scale, mirror ? height / 2 : height, 1)
            if (mirror) trace(scale, height / 2, -1)
            ctx.fill()
        }

        const stop = add_painter(fps, draw, { page: !overlay })

        return () => {
            stop()
            sized.disconnect()
            clearTimeout(recolour)
        }
    }, [motion, palette, gain, mirror, fps, overlay])

    return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className ?? ''}`} />
}
